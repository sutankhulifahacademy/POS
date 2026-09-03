from pydantic import BaseModel, Field
from typing import Optional, Any, Literal


class SaleItem(BaseModel):
    product_id: str
    variant_name: Optional[str] = ""
    name: str
    price: float = Field(..., ge=0)
    quantity: int = Field(..., ge=1)
    note: Optional[str] = ""
    paket_items: Optional[list[dict[str, Any]]] = None


class SaleCreate(BaseModel):
    outlet_id: Optional[str] = ""
    customer_id: Optional[str] = ""

    items: list[SaleItem]

    payment_method: Literal[
        "cash",
        "card",
        "qris",
        "transfer",
    ] = "cash"

    amount_paid: float = Field(..., ge=0)

    # Sales channel + price type for additional pricing
    sales_channel: Optional[str] = "offline"   # offline, online
    price_type: Optional[str] = "ecceran"      # ecceran, reseller, partai, online

    # =========================
    # CARD
    # =========================

    card_type: Optional[str] = ""
    card_brand: Optional[str] = ""
    card_last4: Optional[str] = ""
    card_reference_no: Optional[str] = ""
    card_approval_code: Optional[str] = ""
    card_terminal_id: Optional[str] = ""

    # =========================
    # TRANSFER
    # =========================

    transfer_bank: Optional[str] = ""
    transfer_account_name: Optional[str] = ""
    transfer_account_no: Optional[str] = ""
    transfer_reference_no: Optional[str] = ""
    transfer_sender_name: Optional[str] = ""
    transfer_verified: bool = False

    # =========================
    # GENERAL
    # =========================

    discount: float = Field(0.0, ge=0)
    tax: float = Field(0.0, ge=0)
    note: Optional[str] = ""

    # QRIS order reference: when provided, the backend uses the
    # canonical amount stored in qris_orders instead of recalculating
    # from current product prices. This prevents QRIS/sale divergence.
    qris_order_id: Optional[str] = ""