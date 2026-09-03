"""
Shared dependencies for route modules.
All route files import from here to avoid circular imports.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Response, Header
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Literal, Any
from datetime import datetime, timezone, timedelta
from database import (
    q_one,
    q_all,
    q_exec,
    transaction,
    execute,
    session_one,
    close_database,
)
from utils import (
    verify_password,
    hash_password,
    new_id,
    clean,
    clean_list,
    _u,
    create_token,
)
from routes.auth import get_current_user, require_role, require_permission, require_outlet_access, get_user_outlets, filter_outlets_for_user, validate_outlet_access, has_permission, assert_price_type_authorized, assert_discount_authorized
from models import (
    RegisterIn, LoginIn, AuthUser,
    UserRole, UserCreate, UserUpdate, PasswordReset, UserResponse, UserOutletAccessUpdate,
    ProductVariant, ProductCreate, ProductUpdate,
    SaleItem, SaleCreate,
    OrderItem, OrderCreate, OrderUpdate, OrderCheckout, OrderResponse,
    QRISCreate, PaymentAccountCreate, PaymentAccountUpdate, CardBrandCreate,
    BusinessIn, OutletIn, CategoryIn, StockAdjustIn, CustomerIn, SupplierIn,
    POItem, POIn, TransferItem, TransferIn,
    ShiftOpenIn, ShiftCloseIn, TableIn,
    ClockInIn, ClockOutIn,
    RoleCreate, RoleUpdate, PermissionUpdate, RolePermissionsUpdate,
    MenuCreate, MenuUpdate, RoleMenuUpdate, RoleMenusUpdate,
)

__all__ = [
    # fastapi
    "APIRouter", "HTTPException", "Depends", "Request", "Response", "Header",
    # pydantic
    "BaseModel", "EmailStr",
    # typing
    "List", "Optional", "Literal", "Any",
    # datetime
    "datetime", "timezone", "timedelta",
    # database
    "q_one", "q_all", "q_exec", "transaction", "execute", "session_one", "close_database",
    # utils
    "verify_password", "hash_password", "new_id", "clean", "clean_list", "_u", "create_token",
    # auth
    "get_current_user", "require_role", "require_permission", "require_outlet_access", "get_user_outlets", "filter_outlets_for_user", "validate_outlet_access", "has_permission", "assert_price_type_authorized", "assert_discount_authorized",
    # models
    "RegisterIn", "LoginIn", "AuthUser",
    "UserRole", "UserCreate", "UserUpdate", "PasswordReset", "UserResponse", "UserOutletAccessUpdate",
    "ProductVariant", "ProductCreate", "ProductUpdate",
    "SaleItem", "SaleCreate",
    "OrderItem", "OrderCreate", "OrderUpdate", "OrderCheckout", "OrderResponse",
    "QRISCreate", "PaymentAccountCreate", "PaymentAccountUpdate", "CardBrandCreate",
    "BusinessIn", "OutletIn", "CategoryIn", "StockAdjustIn", "CustomerIn", "SupplierIn",
    "POItem", "POIn", "TransferItem", "TransferIn",
    "ShiftOpenIn", "ShiftCloseIn", "TableIn",
    "ClockInIn", "ClockOutIn",
    "RoleCreate", "RoleUpdate", "PermissionUpdate", "RolePermissionsUpdate",
    "MenuCreate", "MenuUpdate", "RoleMenuUpdate", "RoleMenusUpdate",
]
