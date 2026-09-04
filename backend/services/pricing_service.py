"""Price resolver service — determines the correct price for a product/variant
based on sales channel and price type.

Canonical mapping:
    channel == ONLINE  → online_price (fallback to product.price, existing flow)
    channel == OFFLINE:
        price_type == RESELLER → reseller_price; REJECT if not configured
        price_type == PARTAI   → wholesale_price; REJECT if not configured
        price_type == ECERAN   → product.price (standard selling price)

Products.price is the canonical RETAIL price. products.retail_price is an
additional, separate pricing field and is NOT used for standard POS/Dine-In.
Additional pricing fields are nullable — when a non-retail price type is
explicitly requested but the matching field is NULL, the resolver raises an
HTTP 422 error (PRICE_NOT_CONFIGURED) instead of silently falling back.
"""
from fastapi import HTTPException
from typing import Optional, Any
from services.money import money


def _resolve_price_from_obj(
    obj: dict[str, Any],
    sales_channel: str,
    price_type: str,
) -> float:
    """
    Resolve price from a product or variant dict.

    obj must contain 'price' (the canonical retail price).
    Optional: retail_price, reseller_price, wholesale_price, online_price.
    Returns a Decimal money value.
    """
    existing_price = money(obj.get("price") or 0)

    sales_channel = (sales_channel or "offline").lower()
    price_type = (price_type or "ecceran").lower()

    # =====================================================
    # ONLINE CHANNEL — always use online_price, fallback to price
    # =====================================================
    # Existing online order flow: products without an online_price remain
    # sellable online by falling back to the standard price.
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
        if rp is None:
            raise HTTPException(
                status_code=422,
                detail="PRICE_NOT_CONFIGURED: harga reseller belum diatur untuk produk ini",
            )
        if money(rp) < 0:
            raise HTTPException(
                status_code=422,
                detail="PRICE_NOT_CONFIGURED: harga reseller tidak valid",
            )
        return money(rp)

    if price_type == "partai":
        wp = obj.get("wholesale_price")
        if wp is None:
            raise HTTPException(
                status_code=422,
                detail="PRICE_NOT_CONFIGURED: harga partai belum diatur untuk produk ini",
            )
        if money(wp) < 0:
            raise HTTPException(
                status_code=422,
                detail="PRICE_NOT_CONFIGURED: harga partai tidak valid",
            )
        return money(wp)

    # =====================================================
    # ECERAN (standard POS/Dine-In) — canonical retail price
    # =====================================================
    # products.price is the canonical retail price. products.retail_price is
    # an additional, separate tier and must NOT replace products.price.
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
