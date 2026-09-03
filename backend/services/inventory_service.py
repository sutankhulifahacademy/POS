"""Inventory service — outlet stock helpers."""
from database import q_one, q_exec, execute, session_one
from sqlalchemy import text


async def _get_main_outlet_id():
    r = await q_one("SELECT id FROM outlets WHERE is_main=TRUE LIMIT 1")
    if not r:
        r = await q_one("SELECT id FROM outlets LIMIT 1")
    return str(r["id"]) if r else None


async def _adjust_outlet_stock(product_id: str, outlet_id: str, delta: int):
    """Adjust outlet stock atomically with a non-negative guard.

    For positive deltas: uses INSERT ... ON CONFLICT DO UPDATE (upsert).
    For negative deltas: uses a conditional UPDATE only — inserting a
    zero-quantity row and then not deducting was a bug that created
    phantom inventory when no outlet_stocks row existed.

    Returns the number of rows affected (0 means the update was a no-op,
    either because the row doesn't exist or the non-negative guard failed).

    Note: this helper auto-commits (uses q_exec). For multi-statement
    atomic operations, use `_adjust_outlet_stock_tx` instead.
    """
    if not outlet_id:
        return 0

    if delta < 0:
        # Negative delta: only UPDATE existing rows. Don't insert.
        r = await q_exec(
            """
            UPDATE outlet_stocks
            SET quantity = quantity + :d, updated_at = NOW()
            WHERE product_id = :p AND outlet_id = :o
              AND quantity + :d >= 0
            """,
            p=product_id,
            o=outlet_id,
            d=delta,
        )
        return r
    else:
        # Positive delta: upsert is safe.
        await q_exec(
            """
            INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
            VALUES (:p, :o, :q, NOW())
            ON CONFLICT (product_id, outlet_id)
            DO UPDATE SET quantity = outlet_stocks.quantity + :d,
                          updated_at = NOW()
            WHERE outlet_stocks.quantity + :d >= 0
            """,
            p=product_id,
            o=outlet_id,
            q=delta,
            d=delta,
        )
        return 1


async def _adjust_outlet_stock_tx(session, product_id: str, outlet_id: str, delta: int):
    """Transaction-aware version of _adjust_outlet_stock.

    Uses the provided session (must be inside a `transaction()` block).
    Returns the number of rows affected.
    """
    if not outlet_id:
        return 0

    if delta < 0:
        result = await session.execute(
            text("""
                UPDATE outlet_stocks
                SET quantity = quantity + :d, updated_at = NOW()
                WHERE product_id = :p AND outlet_id = :o
                  AND quantity + :d >= 0
            """),
            {"p": product_id, "o": outlet_id, "d": delta},
        )
        return result.rowcount
    else:
        result = await session.execute(
            text("""
                INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                VALUES (:p, :o, :q, NOW())
                ON CONFLICT (product_id, outlet_id)
                DO UPDATE SET quantity = outlet_stocks.quantity + :d,
                              updated_at = NOW()
                WHERE outlet_stocks.quantity + :d >= 0
            """),
            {"p": product_id, "o": outlet_id, "q": delta, "d": delta},
        )
        return result.rowcount
