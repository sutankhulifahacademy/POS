from pydantic import BaseModel
from typing import Optional, List


class RoleCreate(BaseModel):
    name: str
    label: str
    description: Optional[str] = None


class RoleUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PermissionUpdate(BaseModel):
    module: str
    action: str
    granted: bool


class RolePermissionsUpdate(BaseModel):
    permissions: List[PermissionUpdate]
