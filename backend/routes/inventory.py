"""Inventory routes — stock adjustments and movements."""
from routes.deps import *
from services.inventory_service import _get_main_outlet_id, _adjust_outlet_stock

router = APIRouter()


@router.post("/inventory/adjust")
async def adjust_stock(body: StockAdjustIn, user=Depends(require_role("admin","manager"))):
    p = await q_one("SELECT * FROM products WHERE id=:id", id=body.product_id)
    if not p: raise HTTPException(404, "Product not found")
    new_stock = max(0, p["stock"] + body.delta)
    await q_exec("UPDATE products SET stock=:s, updated_at=NOW() WHERE id=:id", s=new_stock, id=body.product_id)
    await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, user_id, created_at)
                    VALUES (:id, :pid, :pn, :d, :r, :note, :u, NOW())""",
                 id=new_id(), pid=body.product_id, pn=p["name"], d=body.delta, r=body.reason, note=body.note or "", u=user["id"])
    return {"product_id": body.product_id, "new_stock": new_stock}

@router.get("/inventory/movements")
async def list_movements(user=Depends(get_current_user), limit: int = 200):
    rows = await q_all("SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT :l", l=limit)
    return clean_list(rows)
