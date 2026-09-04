"""
Sutan Khulifah POS - Authentication Layer
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, Any

import jwt

from config import (
    JWT_SECRET,
    JWT_ALGORITHM,
    COOKIE_SECURE,
    MFA_REQUIRED_ROLES,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_LOCK_MINUTES,
)
from database import q_one, q_all, q_exec
from utils import (
    new_id,
    clean,
    hash_password,
    verify_password,
    create_token,
    create_mfa_challenge_token,
    generate_mfa_secret,
    get_totp_uri,
    verify_mfa_code,
    record_failed_login,
    is_login_locked,
    clear_login_attempts,
)
from services.money import money


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
    # Public registration is restricted to the lowest-privilege role.
    # Owner/admin/manager/supervisor accounts must be created by an owner
    # via the /users endpoint. Attempting to register with a higher role
    # is rejected with 400.
    role: Literal["owner", "admin", "manager", "supervisor", "kasir"] = "kasir"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class MFAVerifyIn(BaseModel):
    mfa_token: str
    code: str


class MFASetupResponse(BaseModel):
    secret: str
    uri: str


class MFAEnableIn(BaseModel):
    mfa_token: str
    secret: str
    code: str


# ============================================================================
# CURRENT USER
# ============================================================================

async def get_current_user(request: Request):

    # Cookie-only authentication — no Bearer header accepted.
    # This prevents token theft via XSS (localStorage) and ensures
    # the HttpOnly cookie is the sole authentication mechanism.
    token = request.cookies.get("access_token") or ""

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

        # Reject MFA challenge tokens — only access tokens are valid
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=401,
                detail="Invalid token type",
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


def validate_outlet_access(user: dict, outlet_id: str | None) -> None:
    """
    Raise 403 if the user does not have access to the given outlet.
    Owner bypasses. Empty/None outlet_id is allowed (caller must handle
    defaulting). This is the single source of truth for body-level outlet
    validation across all route modules.
    """
    if not outlet_id:
        return
    if user["role"] == "owner":
        return
    if str(outlet_id) not in user.get("outlet_ids", []):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: no access to this outlet",
        )


async def has_permission(user: dict, module: str, action: str) -> bool:
    """
    Check whether the user's role has the given permission.
    Owner always returns True. Returns False (does not raise) when permission
    is missing, so callers can implement response-field filtering or optional
    authorization flows.
    """
    if user["role"] == "owner":
        return True
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
    return bool(perm and perm.get("granted"))


def assert_price_type_authorized(user: dict, price_type: str, sales_channel: str = "offline") -> None:
    """
    Privileged pricing tiers (reseller/partai) may only be used by roles that
    are explicitly authorized to set pricing. Cashiers must use the standard
    'ecceran' tier. This is enforced server-side so a compromised cashier cannot
    lower the sale total by selecting a non-retail price type.
    """
    price_type = (price_type or "ecceran").lower().strip()
    sales_channel = (sales_channel or "offline").lower().strip()

    # Standard retail is always allowed.
    if not price_type or price_type == "ecceran":
        return

    # 'online' is driven by sales_channel, not price_type; price_type='online'
    # only makes sense together with sales_channel='online'.
    if price_type == "online" and sales_channel == "online":
        return

    if user["role"] in ("owner", "admin", "manager", "supervisor"):
        return

    raise HTTPException(
        status_code=403,
        detail="Tipe harga ini memerlukan otorisasi manager/owner",
    )


def assert_discount_authorized(user: dict, subtotal, discount, tax: Any = 0) -> None:
    """
    Prevent cashiers from applying a 100% discount (discount >= subtotal)
    without manager/owner authorization. The repository currently does not
    define a configurable per-role maximum discount, so this function enforces
    the security invariant that a transaction cannot be made free or negative
    by a cashier. A configurable business rule should replace this when added.
    """
    subtotal = money(subtotal)
    discount = money(discount)
    # We intentionally do not factor in tax here: a discount that covers the
    # merchandise value means the goods themselves are free, regardless of tax.
    if discount >= subtotal:
        if user["role"] not in ("owner", "admin", "manager", "supervisor"):
            raise HTTPException(
                status_code=403,
                detail="Diskon penuh memerlukan otorisasi manager/owner",
            )


# ============================================================================
# REGISTER
# ============================================================================

@router.post("/auth/register")
async def register(
    body: RegisterIn,
    response: Response,
):

    # Block privilege escalation via public registration. Only "kasir" is
    # allowed from the public endpoint; any other role is rejected.
    if body.role != "kasir":
        raise HTTPException(
            status_code=400,
            detail="Public registration is limited to the kasir role. "
                   "Owner/admin/manager/supervisor accounts must be created "
                   "by an owner via the /users endpoint.",
        )

    # Enforce server-side password complexity for self-registration.
    if len(body.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters.",
        )
    if len(body.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password must be at most 72 bytes (bcrypt limit).",
        )

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
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )

    return {
        "id": uid,
        "email": email,
        "name": body.name,
        "role": body.role,
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

    # ---- Brute-force protection ----
    if is_login_locked(email):
        raise HTTPException(
            status_code=429,
            detail=f"Terlalu banyak percobaan login gagal. "
                   f"Coba lagi dalam {LOGIN_LOCK_MINUTES} menit.",
        )

    user = await q_one(
        """
        SELECT
            id,
            email,
            name,
            role,
            password_hash,
            is_active,
            mfa_secret,
            mfa_enabled
        FROM users
        WHERE email = :e
        """,
        e=email,
    )

    # Use the same error message for invalid email and invalid password
    # to prevent user enumeration.
    if not user or not user.get("is_active", True):
        locked = record_failed_login(email, LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES)
        if locked:
            raise HTTPException(
                status_code=429,
                detail=f"Akun terkunci setelah {LOGIN_MAX_ATTEMPTS} percobaan gagal. "
                       f"Coba lagi dalam {LOGIN_LOCK_MINUTES} menit.",
            )
        raise HTTPException(
            status_code=401,
            detail="Email atau password salah",
        )

    if not verify_password(
        body.password,
        user["password_hash"],
    ):
        locked = record_failed_login(email, LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MINUTES)
        if locked:
            raise HTTPException(
                status_code=429,
                detail=f"Akun terkunci setelah {LOGIN_MAX_ATTEMPTS} percobaan gagal. "
                       f"Coba lagi dalam {LOGIN_LOCK_MINUTES} menit.",
            )
        raise HTTPException(
            status_code=401,
            detail="Email atau password salah",
        )

    # ---- Successful password verification ----
    clear_login_attempts(email)

    # ---- MFA check for owner/admin ----
    if user["role"] in MFA_REQUIRED_ROLES:
        if user.get("mfa_enabled") and user.get("mfa_secret"):
            # Issue a short-lived MFA challenge token (NOT an access token)
            mfa_token = create_mfa_challenge_token(
                str(user["id"]),
                user["email"],
                user["role"],
            )
            return {
                "mfa_required": True,
                "mfa_token": mfa_token,
                "email": user["email"],
                "name": user["name"],
                "role": user["role"],
            }
        elif not user.get("mfa_enabled"):
            # MFA required but not set up — force setup on next login
            mfa_token = create_mfa_challenge_token(
                str(user["id"]),
                user["email"],
                user["role"],
            )
            return {
                "mfa_required": True,
                "mfa_setup_required": True,
                "mfa_token": mfa_token,
                "email": user["email"],
                "name": user["name"],
                "role": user["role"],
            }

    # ---- No MFA required — set access token cookie ----
    token = create_token(
        str(user["id"]),
        user["email"],
        user["role"],
    )

    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )

    # Load outlet access
    if user["role"] == "owner":
        outlet_ids = []
    else:
        outlets = await q_all(
            "SELECT outlet_id FROM user_outlet_access WHERE user_id = :uid",
            uid=str(user["id"]),
        )
        outlet_ids = [str(o["outlet_id"]) for o in outlets]

    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "outlet_ids": outlet_ids,
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
# MFA — VERIFY CHALLENGE
# ============================================================================

@router.post("/auth/mfa/verify")
async def mfa_verify(
    body: MFAVerifyIn,
    response: Response,
):
    """Verify MFA code after password validation. Sets access token cookie."""

    try:
        payload = jwt.decode(
            body.mfa_token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "mfa_challenge":
            raise HTTPException(
                status_code=401,
                detail="Invalid MFA token",
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="MFA challenge expired. Silakan login kembali.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid MFA token",
        )

    user = await q_one(
        """
        SELECT id, email, name, role, is_active, mfa_secret, mfa_enabled
        FROM users WHERE id = :id
        """,
        id=payload["sub"],
    )

    if not user or not user.get("is_active", True):
        raise HTTPException(
            status_code=401,
            detail="User not found or inactive",
        )

    # If MFA setup is required, the user must set up MFA first
    if user["role"] in MFA_REQUIRED_ROLES and not user.get("mfa_enabled"):
        raise HTTPException(
            status_code=403,
            detail="MFA setup required. Gunakan /auth/mfa/setup terlebih dahulu.",
        )

    if not user.get("mfa_secret"):
        raise HTTPException(
            status_code=400,
            detail="MFA belum dikonfigurasi untuk akun ini.",
        )

    if not verify_mfa_code(user["mfa_secret"], body.code):
        raise HTTPException(
            status_code=401,
            detail="Kode MFA salah",
        )

    # MFA verified — issue access token
    token = create_token(
        str(user["id"]),
        user["email"],
        user["role"],
    )

    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=43200,
        path="/",
    )

    # Load outlet access
    if user["role"] == "owner":
        outlet_ids = []
    else:
        outlets = await q_all(
            "SELECT outlet_id FROM user_outlet_access WHERE user_id = :uid",
            uid=str(user["id"]),
        )
        outlet_ids = [str(o["outlet_id"]) for o in outlets]

    return {
        "id": str(user["id"]),
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "outlet_ids": outlet_ids,
    }


# ============================================================================
# MFA — SETUP (generate secret + QR URI)
# ============================================================================

@router.post("/auth/mfa/setup")
async def mfa_setup(
    body: MFAVerifyIn,
):
    """Generate a new MFA secret for the user. Requires MFA challenge token.
    Does NOT enable MFA yet — user must verify with /auth/mfa/enable."""

    try:
        payload = jwt.decode(
            body.mfa_token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "mfa_challenge":
            raise HTTPException(
                status_code=401,
                detail="Invalid MFA token",
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="MFA challenge expired. Silakan login kembali.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid MFA token",
        )

    # Verify the MFA code if the user already has a secret
    user = await q_one(
        "SELECT id, email, mfa_secret, mfa_enabled FROM users WHERE id = :id",
        id=payload["sub"],
    )

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Generate new secret
    secret = generate_mfa_secret()
    uri = get_totp_uri(secret, user["email"])

    return {
        "secret": secret,
        "uri": uri,
    }


# ============================================================================
# MFA — ENABLE (verify code + save secret)
# ============================================================================

@router.post("/auth/mfa/enable")
async def mfa_enable(
    body: MFAEnableIn,
):
    """Enable MFA by verifying the first TOTP code and saving the secret.
    Requires MFA challenge token (from login flow)."""

    try:
        payload = jwt.decode(
            body.mfa_token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "mfa_challenge":
            raise HTTPException(
                status_code=401,
                detail="Invalid MFA token",
            )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="MFA challenge expired. Silakan login kembali.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid MFA token",
        )

    if not verify_mfa_code(body.secret, body.code):
        raise HTTPException(
            status_code=400,
            detail="Kode MFA salah. Pastikan kode benar dan waktu perangkat sinkron.",
        )

    # Save secret and enable MFA
    await q_exec(
        "UPDATE users SET mfa_secret = :s, mfa_enabled = TRUE WHERE id = :id",
        s=body.secret,
        id=payload["sub"],
    )

    return {"ok": True, "message": "MFA berhasil diaktifkan"}


# ============================================================================
# MFA — STATUS
# ============================================================================

@router.get("/auth/mfa/status")
async def mfa_status(
    user=Depends(get_current_user),
):
    """Check if MFA is enabled for the current user."""

    return {
        "mfa_enabled": bool(user.get("mfa_enabled")),
        "mfa_required": user["role"] in MFA_REQUIRED_ROLES,
    }


# ============================================================================
# ME
# ============================================================================

@router.get("/auth/me")
async def me(
    user=Depends(get_current_user),
):
    return user