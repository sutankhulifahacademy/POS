from pydantic import BaseModel
from typing import Optional, Any


class ProductVariant(BaseModel):
    name: str
    sku: Optional[str] = ""
    price: float
    stock: int = 0


class ProductCreate(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = ""
    category_id: Optional[str] = ""
    price: float
    cost: float = 0.0
    stock: int = 0
    low_stock_threshold: int = 5
    unit: str = "pcs"
    image_url: Optional[str] = ""
    description: Optional[str] = ""
    is_active: bool = True
    variants: list[dict[str, Any]] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    variants: Optional[list[dict[str, Any]]] = None
