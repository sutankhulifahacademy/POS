from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, List


UserRole = Literal["admin", "manager", "supervisor", "kasir"]


class UserOutletAccessUpdate(BaseModel):
    outlet_ids: List[str] = []


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    role: UserRole = "kasir"
    password: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    job_title: Optional[str] = ""
    photo: Optional[str] = ""
    ktp_image: Optional[str] = ""
    ktp_number: Optional[str] = ""


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: Optional[UserRole] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    job_title: Optional[str] = None
    photo: Optional[str] = None
    ktp_image: Optional[str] = None
    ktp_number: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole
    is_active: bool
    phone: Optional[str] = None
    address: Optional[str] = None
    job_title: Optional[str] = None
    photo: Optional[str] = None
    ktp_image: Optional[str] = None
    ktp_number: Optional[str] = None
