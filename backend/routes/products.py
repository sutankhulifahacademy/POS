import json
from typing import Optional
from routes.deps import *

router = APIRouter()

# ============ PRODUCTS ============
@router.get("/products")
async def list_products(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
):
    # Authorization: non-owner can only access assigned outlets
    if outlet_id and user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    if outlet_id:
        # Return products with outlet-specific stock
        rows = await q_all("""
            SELECT p.*, os.quantity AS outlet_stock, o.name AS outlet_name
            FROM products p
            LEFT JOIN outlet_stocks os ON os.product_id = p.id AND os.outlet_id = :oid
            LEFT JOIN outlets o ON o.id = os.outlet_id
            WHERE p.is_active = TRUE
            ORDER BY p.created_at DESC
        """, oid=outlet_id)
    else:
        # Non-owner: show products with stock from their assigned outlets
        if user["role"] != "owner":
            user_outlets = user.get("outlet_ids", [])
            if user_outlets:
                rows = await q_all(f"""
                    SELECT p.*, os.quantity AS outlet_stock, o.name AS outlet_name
                    FROM products p
                    LEFT JOIN outlet_stocks os ON os.product_id = p.id AND os.outlet_id IN ({",".join(f"'{oid}'" for oid in user_outlets)})
                    LEFT JOIN outlets o ON o.id = os.outlet_id
                    WHERE p.is_active = TRUE
                    ORDER BY p.created_at DESC
                """)
            else:
                rows = await q_all("SELECT * FROM products WHERE is_active = TRUE ORDER BY created_at DESC")
        else:
            rows = await q_all("SELECT * FROM products WHERE is_active = TRUE ORDER BY created_at DESC")
    return clean_list(rows)

@router.get("/products/by-barcode/{code}")
async def product_by_barcode(code: str, user=Depends(get_current_user)):
    p = await q_one("SELECT * FROM products WHERE barcode=:c OR sku=:c LIMIT 1", c=code)
    if not p: raise HTTPException(404, "Product not found")
    return clean(p)

@router.post("/products")
async def create_product(body: ProductCreate, user=Depends(require_permission("products", "create"))):
    exists = await q_one("SELECT id FROM products WHERE sku=:s", s=body.sku)
    if exists: raise HTTPException(400, "SKU already exists")
    pid = new_id()
    variants_json = json.dumps(body.variants or [])
    await q_exec("""INSERT INTO products (id, name, sku, barcode, category_id, price, cost, stock, low_stock_threshold,
                                           unit, image_url, description, is_active, variants,
                                           product_type, retail_price, reseller_price, wholesale_price, online_price,
                                           created_at)
                    VALUES (:id, :n, :s, :b, :ci, :p, :c, :st, :lt, :u, :img, :d, :a, CAST(:v AS jsonb),
                            :pt, :rp, :rsp, :wp, :op, NOW())""",
                 id=pid, n=body.name, s=body.sku, b=body.barcode or "", ci=_u(body.category_id),
                 p=body.price, c=body.cost, st=body.stock, lt=body.low_stock_threshold,
                 u=body.unit, img=body.image_url or "", d=body.description or "",
                 a=body.is_active, v=variants_json,
                 pt=body.product_type or "standard",
                 rp=body.retail_price, rsp=body.reseller_price,
                 wp=body.wholesale_price, op=body.online_price)
    if body.stock > 0:
        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, 'initial', 'Initial stock', :u, NOW())""",
                     id=new_id(), pid=pid, pn=body.name, d=body.stock, u=user["id"])
    return clean(await q_one("SELECT * FROM products WHERE id=:id", id=pid))

@router.put("/products/{product_id}")
async def update_product(
    product_id: str,
    body: ProductUpdate,
    user=Depends(require_permission("products", "update"))
):
    data = body.model_dump(exclude_none=True)

    if not data:
        raise HTTPException(400, "Tidak ada data yang diubah")

    # Pastikan product ada
    existing = await q_one(
        "SELECT * FROM products WHERE id=:id",
        id=product_id
    )

    if not existing:
        raise HTTPException(404, "Product not found")

    # Validasi SKU jika SKU diubah
    if "sku" in data and data["sku"] != existing["sku"]:
        duplicate = await q_one(
            """
            SELECT id
            FROM products
            WHERE sku=:sku
              AND id<>:id
            LIMIT 1
            """,
            sku=data["sku"],
            id=product_id
        )

        if duplicate:
            raise HTTPException(400, "SKU already exists")

    updates = []
    params = {
        "id": product_id
    }

    field_mapping = {
        "name": "name",
        "sku": "sku",
        "barcode": "barcode",
        "price": "price",
        "cost": "cost",
        "stock": "stock",
        "low_stock_threshold": "low_stock_threshold",
        "unit": "unit",
        "image_url": "image_url",
        "description": "description",
        "is_active": "is_active",
        "product_type": "product_type",
        "retail_price": "retail_price",
        "reseller_price": "reseller_price",
        "wholesale_price": "wholesale_price",
        "online_price": "online_price",
    }

    for field, column in field_mapping.items():
        if field in data:
            updates.append(f"{column}=:{field}")
            params[field] = data[field]

    if "category_id" in data:
        updates.append("category_id=:category_id")
        params["category_id"] = _u(data["category_id"])

    if "variants" in data:
        updates.append("variants=CAST(:variants AS jsonb)")
        params["variants"] = json.dumps(data["variants"])

    if not updates:
        raise HTTPException(400, "Tidak ada data yang valid untuk diubah")

    updates.append("updated_at=NOW()")

    sql = f"""
        UPDATE products
        SET {", ".join(updates)}
        WHERE id=:id
    """

    await q_exec(sql, **params)

    return clean(
        await q_one(
            "SELECT * FROM products WHERE id=:id",
            id=product_id
        )
    )

@router.delete("/products/{product_id}")
async def delete_product(
    product_id: str,
    user=Depends(require_permission("products", "delete"))
):
    existing = await q_one(
        "SELECT id FROM products WHERE id=:id",
        id=product_id
    )

    if not existing:
        raise HTTPException(404, "Product not found")

    await q_exec(
        "DELETE FROM products WHERE id=:id",
        id=product_id
    )

    return {"ok": True}
