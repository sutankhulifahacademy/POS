from pydantic import BaseModel
from typing import Optional


class QRISCreate(BaseModel):
    amount: int
    description: Optional[str] = "POS checkout"


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
