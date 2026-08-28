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
# LOGGING
# ============================================================================

LOG_LEVEL = os.getenv(
    "LOG_LEVEL",
    "INFO",
).upper()