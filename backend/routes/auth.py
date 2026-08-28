"""
Sutan Khulifah POS - Authentication Layer
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from typing import Literal

import jwt

from config import JWT_SECRET, JWT_ALGORITHM
from database import q_one, q_exec
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
    role: Literal["admin", "manager", "kasir"] = "kasir"


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

        return clean(user)

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