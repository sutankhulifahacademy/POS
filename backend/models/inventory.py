from pydantic import BaseModel, Field, model_validator
from typing import Optional, List


class POItem(BaseModel):
    product_id: str
    name: str
    quantity: int = Field(..., ge=1)
    cost: float = Field(..., ge=0)


class POIn(BaseModel):
    supplier_id: str
    supplier_name: str
    items: List[POItem]
    note: Optional[str] = ""
    outlet_id: Optional[str] = None


class TransferItem(BaseModel):
    product_id: str
    name: str
    quantity: int = Field(..., ge=1)


class TransferIn(BaseModel):
    from_outlet_id: str
    to_outlet_id: str
    from_outlet_name: str
    to_outlet_name: str
    items: List[TransferItem]
    note: Optional[str] = ""

    @model_validator(mode='after')
    def validate_outlets_different(self):
        if self.from_outlet_id == self.to_outlet_id:
            raise ValueError("from_outlet_id dan to_outlet_id tidak boleh sama")
        if not self.items:
            raise ValueError("Items tidak boleh kosong")
        return self


class ShiftOpenIn(BaseModel):
    outlet_id: Optional[str] = ""
    opening_cash: float = Field(0.0, ge=0)
    note: Optional[str] = ""


class ShiftCloseIn(BaseModel):
    actual_cash: float = Field(..., ge=0)
    note: Optional[str] = ""


class TableIn(BaseModel):
    name: str
    capacity: int = Field(2, ge=1)
    outlet_id: Optional[str] = ""
    zone: Optional[str] = "Utama"


class ClockInIn(BaseModel):
    photo: Optional[str] = ""
    note: Optional[str] = ""
    outlet_id: Optional[str] = None


class ClockOutIn(BaseModel):
    photo: Optional[str] = ""
    note: Optional[str] = ""
