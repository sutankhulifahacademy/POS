from pydantic import BaseModel
from typing import Optional, List


class POItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    cost: float


class POIn(BaseModel):
    supplier_id: str
    supplier_name: str
    items: List[POItem]
    note: Optional[str] = ""


class TransferItem(BaseModel):
    product_id: str
    name: str
    quantity: int


class TransferIn(BaseModel):
    from_outlet_id: str
    to_outlet_id: str
    from_outlet_name: str
    to_outlet_name: str
    items: List[TransferItem]
    note: Optional[str] = ""


class ShiftOpenIn(BaseModel):
    outlet_id: Optional[str] = ""
    opening_cash: float = 0.0
    note: Optional[str] = ""


class ShiftCloseIn(BaseModel):
    actual_cash: float
    note: Optional[str] = ""


class TableIn(BaseModel):
    name: str
    capacity: int = 2
    outlet_id: Optional[str] = ""
    zone: Optional[str] = "Utama"


class ClockInIn(BaseModel):
    photo: Optional[str] = ""
    note: Optional[str] = ""


class ClockOutIn(BaseModel):
    photo: Optional[str] = ""
    note: Optional[str] = ""
