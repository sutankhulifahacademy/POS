"""
Sutan Khulifah POS - Backend Configuration
Centralized environment configuration.
"""

from pathlib import Path
from dotenv import load_dotenv
import os


# ============================================================================
# BASE DIRECTORY
# ============================================================================

ROOT_DIR = Path(__file__).resolve().parent

# Load .env dari folder backend
load_dotenv(ROOT_DIR / ".env")


# ============================================================================
# APPLICATION
# ============================================================================

APP_NAME = os.getenv(
    "APP_NAME",
    "Sutan Khulifah POS API",
)

APP_VERSION = os.getenv(
    "APP_VERSION",
    "1.0.0",
)


# ============================================================================
# DATABASE
# ============================================================================

DATABASE_URL = os.getenv("POSTGRES_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "POSTGRES_URL belum dikonfigurasi di file backend/.env"
    )

# SQLAlchemy async membutuhkan postgresql+asyncpg
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://",
        "postgresql+asyncpg://",
        1,
    )


# ============================================================================
# JWT / AUTHENTICATION
# ============================================================================

JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET belum dikonfigurasi di file backend/.env"
    )

# Reject known insecure placeholder values in any environment.
_INSECURE_SECRETS = {
    "changeme",
    "change_me",
    "change-me",
    "secret",
    "default-secret",
    "change_me_to_a_random_64_character_secret",
    "ganti-dengan-string-acak-64-karakter-untuk-produksi",
}

if JWT_SECRET.strip().lower() in _INSECURE_SECRETS:
    raise RuntimeError(
        "JWT_SECRET menggunakan nilai placeholder yang tidak aman. "
        "Gunakan string acak minimal 64 karakter."
    )

if len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET terlalu pendek (minimal 32 karakter). "
        "Gunakan string acak minimal 64 karakter untuk produksi."
    )

JWT_ALGORITHM = os.getenv(
    "JWT_ALGORITHM",
    "HS256",
)

JWT_EXPIRE_MINUTES = int(
    os.getenv(
        "JWT_EXPIRE_MINUTES",
        "1440",
    )
)


# ============================================================================
# ADMIN DEFAULT
# ============================================================================

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

_INSECURE_PASSWORDS = {
    "changeme",
    "change_me",
    "change-me",
    "admin123",
    "password",
    "owner@2026",
    "kasir@2026",
    "manager@2026",
}

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    raise RuntimeError(
        "ADMIN_EMAIL dan ADMIN_PASSWORD wajib dikonfigurasi di environment. "
        "Application startup aborted."
    )

if ADMIN_PASSWORD.strip().lower() in _INSECURE_PASSWORDS:
    raise RuntimeError(
        "ADMIN_PASSWORD menggunakan nilai default yang tidak aman. "
        "Gunakan password yang kuat dan unik. "
        "Application startup aborted."
    )

if len(ADMIN_PASSWORD) < 8:
    raise RuntimeError(
        "ADMIN_PASSWORD terlalu pendek (minimal 8 karakter). "
        "Application startup aborted."
    )


# ============================================================================
# CORS
# ============================================================================

_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)

CORS_ORIGINS = [
    origin.strip()
    for origin in _cors_origins.split(",")
    if origin.strip()
]


# ============================================================================
# ENVIRONMENT
# ============================================================================

ENVIRONMENT = os.getenv(
    "ENVIRONMENT",
    "development",
)


DEBUG = os.getenv(
    "DEBUG",
    "false",
).lower() in (
    "1",
    "true",
    "yes",
    "on",
)


# ============================================================================
# COOKIE SECURITY
# ============================================================================
# In production (HTTPS), cookies must be Secure=True.
# In development (HTTP), Secure=True would prevent the cookie from being
# sent, so we allow it to be disabled via env.

COOKIE_SECURE = os.getenv(
    "COOKIE_SECURE",
    "true" if ENVIRONMENT == "production" else "false",
).lower() in ("1", "true", "yes", "on")


# ============================================================================
# MFA / TOTP
# ============================================================================
# MFA is required for owner and admin roles.
# Uses TOTP (RFC 6238) with pyotp.

MFA_REQUIRED_ROLES = {"owner", "admin"}
MFA_ISSUER = os.getenv("MFA_ISSUER", "Republik Dimsum POS")


# ============================================================================
# LOGIN RATE LIMITING
# ============================================================================
# Brute-force protection: max failed attempts before temporary lockout.

LOGIN_MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_LOCK_MINUTES = int(os.getenv("LOGIN_LOCK_MINUTES", "15"))


# ============================================================================
# LOGGING
# ============================================================================

LOG_LEVEL = os.getenv(
    "LOG_LEVEL",
    "INFO",
).upper()