from pydantic import BaseModel, Field
from typing import Optional, Any, Literal


class OrderItem(BaseModel):
    product_id: str
    name: str
    price: float = Field(..., ge=0)
    quantity: int = Field(..., ge=1)
    variant_name: Optional[str] = ""
    note: Optional[str] = ""


class OrderCreate(BaseModel):
    order_no: Optional[str] = None
    table_id: Optional[str] = None
    table_name: Optional[str] = None
    outlet_id: Optional[str] = None
    guest_count: int = Field(1, ge=1)
    items: list[OrderItem] = []
    total: float = 0
    status: str = "open"
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None


class OrderUpdate(BaseModel):
    table_id: Optional[str] = None
    table_name: Optional[str] = None
    guest_count: Optional[int] = Field(None, ge=1)
    items: Optional[list[OrderItem]] = None
    total: Optional[float] = None
    status: Optional[str] = None


class OrderCheckout(BaseModel):
    outlet_id: Optional[str] = ""
    customer_id: Optional[str] = ""

    payment_method: Literal[
        "cash",
        "card",
        "qris",
        "transfer"
    ] = "cash"

    amount_paid: float = Field(..., ge=0)

    discount: float = Field(0.0, ge=0)
    tax: float = Field(0.0, ge=0)
    note: Optional[str] = ""

    # CARD
    card_type: Optional[str] = ""
    card_brand: Optional[str] = ""
    card_last4: Optional[str] = ""
    card_reference_no: Optional[str] = ""
    card_approval_code: Optional[str] = ""
    card_terminal_id: Optional[str] = ""

    # TRANSFER
    transfer_bank: Optional[str] = ""
    transfer_account_name: Optional[str] = ""
    transfer_account_no: Optional[str] = ""
    transfer_reference_no: Optional[str] = ""
    transfer_sender_name: Optional[str] = ""
    transfer_verified: bool = False

    # Sales channel + price type for additional pricing
    sales_channel: Optional[str] = "offline"
    price_type: Optional[str] = "ecceran"

    # QRIS order reference: used to ensure the sale total matches the
    # QRIS charge amount created by /payments/qris.
    qris_order_id: Optional[str] = ""


class OrderResponse(BaseModel):
    id: str
    order_no: str
    table_id: Optional[str] = None
    table_name: Optional[str] = None
    outlet_id: Optional[str] = None
    guest_count: int = 1
    items: list[dict[str, Any]] = []
    total: float = 0
    status: str
    cashier_id: Optional[str] = None
    cashier_name: Optional[str] = None
