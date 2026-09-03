"""Price resolver service — determines the correct price for a product/variant
based on sales channel and price type.

Rules:
    channel == ONLINE  → online_price (fallback to product.price)
    channel == OFFLINE:
        price_type == RESELLER → reseller_price (fallback to price)
        price_type == PARTAI   → wholesale_price (fallback to price)
        price_type == ECERAN   → product.price (standard selling price)
        default                → price (existing behavior)

Existing product.price is NEVER modified. Additional pricing fields are
nullable — when NULL, the system falls back to product.price so old products
remain valid.

IMPORTANT: For standard POS/Dine-In (price_type == "ecceran"), the source
of truth is products.price — NOT retail_price. The retail_price field is
a separate pricing tier and must not automatically replace products.price.
"""
from typing import Optional, Any
from services.money import money


def _resolve_price_from_obj(
    obj: dict[str, Any],
    sales_channel: str,
    price_type: str,
) -> float:
    """
    Resolve price from a product or variant dict.

    obj must contain 'price' (the existing price field).
    Optional: retail_price, reseller_price, wholesale_price, online_price.
    Returns a Decimal money value.
    """
    existing_price = money(obj.get("price") or 0)

    sales_channel = (sales_channel or "offline").lower()
    price_type = (price_type or "ecceran").lower()

    # =====================================================
    # ONLINE CHANNEL — always use online_price
    # =====================================================
    if sales_channel == "online":
        online_price = obj.get("online_price")
        if online_price is not None and money(online_price) >= 0:
            return money(online_price)
        return existing_price

    # =====================================================
    # OFFLINE CHANNEL — use price_type
    # =====================================================
    if price_type == "reseller":
        rp = obj.get("reseller_price")
        if rp is not None and money(rp) >= 0:
            return money(rp)
        return existing_price

    if price_type == "partai":
        wp = obj.get("wholesale_price")
        if wp is not None and money(wp) >= 0:
            return money(wp)
        return existing_price

    # =====================================================
    # ECERAN (standard POS/Dine-In) — use products.price
    # =====================================================
    # products.price is the standard selling price for POS/Dine-In.
    # retail_price is a separate pricing tier and must NOT automatically
    # replace products.price for standard transactions.
    # =====================================================
    return existing_price


async def resolve_product_price(
    product: dict[str, Any],
    variant_name: str = "",
    sales_channel: str = "offline",
    price_type: str = "ecceran",
) -> float:
    """
    Resolve the final price for a product (optionally with variant).

    If variant_name is provided and the product has a matching variant,
    the variant's pricing fields are used. Otherwise, product-level
    pricing is used.
    """
    variants = product.get("variants") or []

    if variant_name and variants:
        for v in variants:
            v_name = v.get("name") if isinstance(v, dict) else None
            if v_name and str(v_name) == str(variant_name):
                return _resolve_price_from_obj(v, sales_channel, price_type)

    return _resolve_price_from_obj(product, sales_channel, price_type)
