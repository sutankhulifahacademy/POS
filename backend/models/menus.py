from pydantic import BaseModel
from typing import Optional, List


class MenuCreate(BaseModel):
    name: str
    label: str
    description: Optional[str] = None
    route: str
    icon: str = "Circle"
    sort_order: int = 0
    parent_id: Optional[str] = None
    is_active: bool = True


class MenuUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    route: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    parent_id: Optional[str] = None
    is_active: Optional[bool] = None


class RoleMenuUpdate(BaseModel):
    menu_id: str
    is_visible: bool


class RoleMenusUpdate(BaseModel):
    menus: List[RoleMenuUpdate]
