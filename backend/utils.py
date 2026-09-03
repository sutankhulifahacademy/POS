from __future__ import annotations

import uuid
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import bcrypt
import jwt
import pyotp

from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, MFA_ISSUER


# ============================================================================
# ID / DATETIME
# ============================================================================

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ============================================================================
# SERIALIZATION
# ============================================================================

def _serialize(v: Any) -> Any:
    """
    Convert non-JSON-serializable PostgreSQL values.
    """
    if isinstance(v, uuid.UUID):
        return str(v)

    if isinstance(v, datetime):
        return v.isoformat()

    return v


def clean(row: Optional[dict]) -> Optional[dict]:
    if row is None:
        return None

    return {
        key: _serialize(value)
        for key, value in row.items()
    }


def clean_list(rows: list[dict]) -> list[dict]:
    return [clean(row) for row in rows]


# ============================================================================
# UUID / OPTIONAL VALUE
# ============================================================================

def _u(v: Any) -> Any:
    """
    Convert empty string to None.

    Dipakai untuk field PostgreSQL UUID nullable.
    """
    return None if not v or v == "" else v


# ============================================================================
# PASSWORD
# ============================================================================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed.encode("utf-8"),
        )
    except Exception:
        return False


# ============================================================================
# JWT
# ============================================================================

def create_token(
    uid: str,
    email: str,
    role: str,
) -> str:

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=JWT_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(uid),
        "email": email,
        "role": role,
        "exp": expire,
        "type": "access",
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_mfa_challenge_token(
    uid: str,
    email: str,
    role: str,
) -> str:
    """Short-lived (5 min) token used only to verify MFA code.
    Not accepted by get_current_user — only by /auth/mfa/verify."""

    expire = datetime.now(timezone.utc) + timedelta(minutes=5)

    payload = {
        "sub": str(uid),
        "email": email,
        "role": role,
        "exp": expire,
        "type": "mfa_challenge",
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


# ============================================================================
# MFA / TOTP
# ============================================================================

def generate_mfa_secret() -> str:
    """Generate a new TOTP secret."""
    return pyotp.random_base32()


def get_totp(secret: str, email: str) -> pyotp.TOTP:
    """Return a TOTP instance with issuer label."""
    return pyotp.TOTP(
        secret,
        name=email,
        issuer=MFA_ISSUER,
    )


def get_totp_uri(secret: str, email: str) -> str:
    """Return the otpauth:// URI for QR code generation."""
    return get_totp(secret, email).provisioning_uri()


def verify_mfa_code(secret: str, code: str) -> bool:
    """Verify a TOTP code against the secret. Allows ±1 time step."""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    try:
        return totp.verify(str(code).strip(), valid_window=1)
    except Exception:
        return False


# ============================================================================
# LOGIN RATE LIMITING (in-process)
# ============================================================================

_login_attempts: dict[str, dict] = {}  # email -> {count, first_ts, locked_until}


def record_failed_login(email: str, max_attempts: int, lock_minutes: int) -> bool:
    """Record a failed login attempt. Returns True if account is now locked."""
    now = time.time()
    entry = _login_attempts.get(email)

    if entry and entry.get("locked_until", 0) > now:
        return True  # already locked

    if not entry or entry.get("first_ts", 0) < now - lock_minutes * 60:
        # Reset window
        entry = {"count": 0, "first_ts": now, "locked_until": 0}

    entry["count"] += 1

    if entry["count"] >= max_attempts:
        entry["locked_until"] = now + lock_minutes * 60
        _login_attempts[email] = entry
        return True

    _login_attempts[email] = entry
    return False


def is_login_locked(email: str) -> bool:
    """Check if an email is currently locked out."""
    entry = _login_attempts.get(email)
    if not entry:
        return False
    return entry.get("locked_until", 0) > time.time()


def clear_login_attempts(email: str) -> None:
    """Clear failed login attempts after successful login."""
    _login_attempts.pop(email, None)