from pydantic import BaseModel, Field
from typing import Optional, Any


class QRISItem(BaseModel):
    product_id: str
    quantity: int = Field(ge=1)
    variant_name: Optional[str] = ""
    note: Optional[str] = ""


class QRISCreate(BaseModel):
    amount: Optional[int] = None  # Deprecated: backend calculates from items
    description: Optional[str] = "POS checkout"
    outlet_id: Optional[str] = None
    price_type: Optional[str] = "ecceran"
    discount: Optional[float] = Field(default=0, ge=0)
    tax: Optional[float] = Field(default=0, ge=0)
    items: Optional[list[QRISItem]] = None


class PaymentAccountCreate(BaseModel):
    bank_name: str
    account_name: str
    account_no: str
    outlet_id: Optional[str] = None
    is_active: bool = True


class PaymentAccountUpdate(BaseModel):
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_no: Optional[str] = None
    outlet_id: Optional[str] = None
    is_active: Optional[bool] = None


class CardBrandCreate(BaseModel):
    name: str
