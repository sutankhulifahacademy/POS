"""
Sutan Khulifah POS - Database Layer

Centralized PostgreSQL / SQLAlchemy async database helpers.

Functions:
    - q_one()
    - q_all()
    - q_exec()
    - get_db()
    - transaction helpers
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from config import DATABASE_URL


# ============================================================================
# ENGINE
# ============================================================================

engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
    echo=False,
)


# ============================================================================
# SESSION FACTORY
# ============================================================================

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ============================================================================
# DATABASE SESSION DEPENDENCY
# ============================================================================

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency untuk mendapatkan AsyncSession.

    Usage:

        async def endpoint(
            db: AsyncSession = Depends(get_db)
        ):
            ...
    """

    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# ============================================================================
# QUERY HELPERS
# ============================================================================

async def q_one(
    sql: str,
    **params: Any,
) -> Optional[dict[str, Any]]:
    """
    Execute query dan mengambil satu row.

    Return:
        dict jika ditemukan
        None jika tidak ditemukan
    """

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(sql),
            params,
        )

        row = result.mappings().first()

        if row is None:
            return None

        return dict(row)


async def q_all(
    sql: str,
    **params: Any,
) -> list[dict[str, Any]]:
    """
    Execute query dan mengambil seluruh row.

    Return:
        list[dict]
    """

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(sql),
            params,
        )

        rows = result.mappings().all()

        return [dict(row) for row in rows]


async def q_exec(
    sql: str,
    **params: Any,
) -> int:
    """
    Execute INSERT / UPDATE / DELETE.

    Return:
        jumlah row yang terpengaruh.
    """

    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(
                text(sql),
                params,
            )

            await session.commit()

            return result.rowcount or 0

        except Exception:
            await session.rollback()
            raise


# ============================================================================
# TRANSACTION HELPER
# ============================================================================

@asynccontextmanager
async def transaction() -> AsyncGenerator[AsyncSession, None]:
    """
    Transaction context manager.

    Semua operasi di dalam block akan di-commit
    jika berhasil dan rollback jika terjadi exception.

    Example:

        async with transaction() as db:
            await db.execute(...)
            await db.execute(...)
    """

    async with AsyncSessionLocal() as session:
        try:
            async with session.begin():
                yield session

        except Exception:
            await session.rollback()
            raise


# ============================================================================
# SESSION EXECUTION HELPERS
# ============================================================================

async def execute(
    session: AsyncSession,
    sql: str,
    **params: Any,
):
    """
    Execute SQL menggunakan session yang sudah ada.

    Digunakan ketika beberapa query harus berada
    dalam transaction yang sama.
    """

    return await session.execute(
        text(sql),
        params,
    )


async def session_one(
    session: AsyncSession,
    sql: str,
    **params: Any,
) -> Optional[dict[str, Any]]:
    """
    Ambil satu row menggunakan session existing.

    Penting untuk transaksi multi-query.
    """

    result = await session.execute(
        text(sql),
        params,
    )

    row = result.mappings().first()

    if row is None:
        return None

    return dict(row)


async def session_all(
    session: AsyncSession,
    sql: str,
    **params: Any,
) -> list[dict[str, Any]]:
    """
    Ambil seluruh row menggunakan session existing.
    """

    result = await session.execute(
        text(sql),
        params,
    )

    rows = result.mappings().all()

    return [dict(row) for row in rows]


# ============================================================================
# DATABASE LIFECYCLE
# ============================================================================

async def check_database_connection() -> bool:
    """
    Test koneksi PostgreSQL.

    Return:
        True  -> database dapat diakses
        False -> gagal
    """

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))

        return True

    except Exception:
        return False


async def close_database() -> None:
    """
    Dispose SQLAlchemy engine.
    """

    await engine.dispose()