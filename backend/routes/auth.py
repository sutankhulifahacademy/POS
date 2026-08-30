"""
Sutan Khulifah POS - Authentication Layer
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from typing import Literal

import jwt

from config import JWT_SECRET, JWT_ALGORITHM
from database import q_one, q_all, q_exec
from utils import (
    new_id,
    clean,
    hash_password,
    verify_password,
    create_token,
)


# ============================================================================
# ROUTER
# ============================================================================

router = APIRouter()


# ============================================================================
# MODELS
# ============================================================================

class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["owner", "admin", "manager", "supervisor", "kasir"] = "kasir"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# ============================================================================
# CURRENT USER
# ============================================================================

async def get_current_user(request: Request):

    token = request.cookies.get("access_token") or ""

    if not token:
        auth = request.headers.get("Authorization", "")

        if auth.startswith("Bearer "):
            token = auth[7:]

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user = await q_one(
            """
            SELECT
                id,
                email,
                name,
                role,
                is_active
            FROM users
            WHERE id = :id
            """,
            id=payload["sub"],
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found",
            )

        if user.get("is_active") is False:
            raise HTTPException(
                status_code=401,
                detail="User inactive",
            )

        result = clean(user)

        # Load outlet access — only owner gets all outlets
        if result["role"] == "owner":
            result["outlet_ids"] = []  # owner = all outlets
        else:
            outlets = await q_all(
                "SELECT outlet_id FROM user_outlet_access WHERE user_id = :uid",
                uid=result["id"],
            )
            result["outlet_ids"] = [str(o["outlet_id"]) for o in outlets]

        return result

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired",
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )


# ============================================================================
# ROLE DEPENDENCY
# ============================================================================

def require_role(*roles):

    async def dependency(
        user: dict = Depends(get_current_user),
    ):
        if user["role"] not in roles:
            raise HTTPException(
                status_code=403,
                detail="Forbidden",
            )

        return user

    return dependency


# ============================================================================
# PERMISSION DEPENDENCY (module/action based)
# ============================================================================

def require_permission(module: str, action: str):

    async def dependency(
        user: dict = Depends(get_current_user),
    ):
        # Owner bypasses all permission checks
        if user["role"] == "owner":
            return user

        # Look up role_permissions for this user's role
        perm = await q_one(
            """
            SELECT granted FROM role_permissions rp
            JOIN roles r ON rp.role_id = r.id
            WHERE r.name = :role AND rp.module = :module AND rp.action = :action
            """,
            role=user["role"],
            module=module,
            action=action,
        )

        if not perm or not perm.get("granted"):
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: missing permission {module}.{action}",
            )

        return user

    return dependency


# ============================================================================
# OUTLET ACCESS DEPENDENCY
# ============================================================================

def require_outlet_access(outlet_id_param: str = "outlet_id"):
    """
    Dependency that checks if the current user can access the specified outlet.
    For admin, always passes.
    For other roles, checks user_outlet_access table.
    """

    async def dependency(
        request: Request,
        user: dict = Depends(get_current_user),
    ):
        if user["role"] == "owner":
            return user

        # Get outlet_id from query params, path params, or body
        outlet_id = request.query_params.get(outlet_id_param, "")

        if not outlet_id:
            # Try path params
            outlet_id = request.path_params.get(outlet_id_param, "")

        if not outlet_id:
            # Try to get from body (for POST/PUT)
            try:
                body = await request.json()
                outlet_id = body.get(outlet_id_param, "") or body.get("from_outlet_id", "")
            except Exception:
                outlet_id = ""

        # If no outlet_id specified, allow (endpoint will use default)
        if not outlet_id:
            return user

        outlet_id = str(outlet_id)

        if outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: no access to this outlet",
            )

        return user

    return dependency


async def get_user_outlets(user: dict) -> list:
    """Get list of outlet IDs the user can access. Empty = all outlets (owner)."""
    if user["role"] == "owner":
        return []  # all outlets
    return user.get("outlet_ids", [])


async def filter_outlets_for_user(user: dict, sql_filter: str = "outlet_id") -> str:
    """
    Returns SQL filter clause for outlet scoping.
    For owner: returns empty string (no filter).
    For others: returns 'AND {sql_filter} IN (...)' with their outlet_ids.
    """
    if user["role"] == "owner":
        return ""

    outlet_ids = user.get("outlet_ids", [])
    if not outlet_ids:
        # No outlet access at all
        return f"AND {sql_filter} IN ('00000000-0000-0000-0000-000000000000')"

    ids_sql = ",".join(f"'{oid}'" for oid in outlet_ids)
    return f"AND {sql_filter} IN ({ids_sql})"


# ============================================================================
# REGISTER
# ============================================================================

@router.post("/auth/register")
async def register(
    body: RegisterIn,
    response: Response,
):

    email = body.email.lower()

    exists = await q_one(
        """
        SELECT id
        FROM users
        WHERE email = :e
        """,
        e=email,
    )

    if exists:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    uid = new_id()

    await q_exec(
        """
        INSERT INTO users (
            id,
            email,
            name,
            role,
            password_hash,
            is_active,
            created_at
        )
        VALUES (
            :id,
            :e,
            :n,
            :r,
            :h,
            TRUE,
            NOW()
        )
        """,
        id=uid,
        e=email,
        n=body.name,
        r=body.role,
        h=hash_password(body.password),
    )

    token = create_token(
        uid,
        email,
        body.role,
    )

    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=43200,
        path="/",
    )

    return {
        "id": uid,
        "email": email,
        "name": body.name,
        "role": body.role,
        "token": token,
    }


# ============================================================================
# LOGIN
# ============================================================================

@router.post("/auth/login")
async def login(
    body: LoginIn,
    response: Response,
):

    email = body.email.lower()

    user = await q_one(
        """
        SELECT
            id,
            email,
            name,
            role,
            password_hash,
            is_active
        FROM users
        WHERE email = :e
        """,
        e=email,
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=401,
            detail="User inactive",
        )

    if not verify_password(
        body.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = create_token(
        str(user["id"]),
        user["email"],
        user["role"],
    )

    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=43200,
        path="/",
    )

    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "token": token,
    }


# ============================================================================
# LOGOUT
# ============================================================================

@router.post("/auth/logout")
async def logout(response: Response):

    response.delete_cookie(
        "access_token",
        path="/",
    )

    return {
        "ok": True,
    }


# ============================================================================
# ME
# ============================================================================

@router.get("/auth/me")
async def me(
    user=Depends(get_current_user),
):
    return user