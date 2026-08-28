from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import bcrypt
import jwt

from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_MINUTES


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