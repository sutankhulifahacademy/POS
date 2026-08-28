from pydantic import BaseModel, EmailStr
from typing import Literal


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "manager", "kasir"] = "kasir"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthUser(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Literal["admin", "manager", "kasir"]
    is_active: bool = True
