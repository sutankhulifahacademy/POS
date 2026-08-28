"""Inventory service — outlet stock helpers."""
from database import q_one, q_exec


async def _get_main_outlet_id():
    r = await q_one("SELECT id FROM outlets WHERE is_main=TRUE LIMIT 1")
    if not r:
        r = await q_one("SELECT id FROM outlets LIMIT 1")
    return str(r["id"]) if r else None


async def _adjust_outlet_stock(product_id: str, outlet_id: str, delta: int):
    if not outlet_id:
        return
    existing = await q_one(
        "SELECT id, quantity FROM outlet_stocks WHERE product_id=:p AND outlet_id=:o",
        p=product_id,
        o=outlet_id,
    )
    main = await _get_main_outlet_id()
    if not existing:
        # Seed: main outlet gets product.stock, others get 0
        product = await q_one("SELECT stock FROM products WHERE id=:id", id=product_id)
        base = product["stock"] if (product and str(outlet_id) == main) else 0
        await q_exec(
            """INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                        VALUES (:p, :o, :q, NOW())""",
            p=product_id,
            o=outlet_id,
            q=base + delta,
        )
    else:
        await q_exec(
            "UPDATE outlet_stocks SET quantity=quantity+:d, updated_at=NOW() WHERE id=:id",
            d=delta,
            id=existing["id"],
        )
