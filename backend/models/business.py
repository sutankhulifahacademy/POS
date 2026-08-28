from pydantic import BaseModel
from typing import Optional, Literal


class BusinessIn(BaseModel):
    name: str
    business_type: Literal["retail", "fnb", "fashion", "general"]
    currency: str = "IDR"
    tax_rate: float = 0.0
    address: Optional[str] = ""


class OutletIn(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    is_main: bool = False


class CategoryIn(BaseModel):
    name: str
    color: Optional[str] = "#F4C842"


class StockAdjustIn(BaseModel):
    product_id: str
    delta: int
    reason: str
    note: Optional[str] = ""


class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""


class SupplierIn(BaseModel):
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""
