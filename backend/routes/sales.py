"""Sales routes — POS transactions, takeaway sales."""
import json
import hashlib
from routes.deps import *
from routes.inventory import _get_main_outlet_id
from services.money import money
from services.sales_service import (
    _validate_sale_total,
    _validate_payment,
    _build_payment_values,
    _validate_and_get_sale_items,
    _deduct_sale_stock,
    _insert_sale,
)

router = APIRouter()


# ============================================================
# IDEMPOTENCY CACHE
# ============================================================
# Prevents duplicate sale creation from double-click, network
# retry, or browser refresh. The frontend sends an
# Idempotency-Key header; the backend stores keys in the database
# with a UNIQUE constraint so duplicate requests return the original
# sale atomically, even across multiple workers/containers.
# ============================================================
async def _resolve_idempotency(
    session,
    idempotency_key: str,
    sale_id: str,
):
    """
    Database-backed atomic idempotency.

    Insert idempotency key with the planned sale_id. If the key already
    exists, return the existing sale. Uses PostgreSQL ON CONFLICT so the
    check-and-claim is atomic.

    Returns:
        (ok, existing_sale_row or None)
    """
    if not idempotency_key:
        return True, None

    claim = await execute(
        session,
        """
        INSERT INTO idempotency_keys (id, key, sale_id, created_at)
        VALUES (:id, :key, :sale_id, NOW())
        ON CONFLICT (key) DO NOTHING
        """,
        id=new_id(),
        key=idempotency_key,
        sale_id=sale_id,
    )

    if claim.rowcount == 1:
        return True, None

    existing = await session_one(
        session,
        """
        SELECT s.*, s.change_amount AS change, o.name AS outlet_name,
               o.address AS outlet_address, o.phone AS outlet_phone
        FROM idempotency_keys ik
        JOIN sales s ON ik.sale_id = s.id
        LEFT JOIN outlets o ON s.outlet_id = o.id
        WHERE ik.key = :key
        LIMIT 1
        """,
        key=idempotency_key,
    )
    return False, existing


@router.post("/sales")
async def create_sale(
    body: SaleCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    user=Depends(get_current_user)
):
    """
    Transaksi POS biasa / takeaway.

    Endpoint ini TIDAK berhubungan dengan orders/meja.

    Dine-in menggunakan:
        /orders/{order_id}/checkout

    Sales + stock + outlet stock + stock movement
    diproses dalam satu database transaction.
    """

    # =========================================================
    # VALIDASI ITEMS + STOCK (read-only, deterministic)
    # =========================================================

    sales_channel = getattr(body, "sales_channel", "offline") or "offline"
    price_type = getattr(body, "price_type", "ecceran") or "ecceran"

    # F1: cashier must not use privileged pricing tiers (reseller/partai)
    # without manager/owner authorization.
    assert_price_type_authorized(user, price_type, sales_channel)

    items, subtotal = await _validate_and_get_sale_items(
        body.items,
        sales_channel=sales_channel,
        price_type=price_type,
    )

    # =========================================================
    # TOTAL
    # =========================================================

    total = _validate_sale_total(
        subtotal,
        body.discount,
        body.tax
    )

    # F2: cashier cannot apply a 100% discount (discount >= subtotal) without
    # manager/owner authorization. _validate_sale_total already rejects
    # discount > subtotal; this guard catches discount == subtotal (total <= tax).
    assert_discount_authorized(user, subtotal, body.discount, body.tax)

    # =========================================================
    # QRIS AMOUNT VALIDATION
    # =========================================================
    # For QRIS payments, the sale total must match the QRIS charge
    # amount already created by /payments/qris. Both are calculated
    # canonically from the same item snapshot.
    # =========================================================
    qris_order = None
    if body.payment_method == "qris":
        if not body.qris_order_id:
            raise HTTPException(400, "QRIS order_id wajib disertakan")
        qris_order = await q_one(
            "SELECT * FROM qris_orders WHERE order_id=:oid",
            oid=body.qris_order_id,
        )
        if not qris_order:
            raise HTTPException(404, "QRIS order tidak ditemukan")
        if qris_order.get("sale_id"):
            raise HTTPException(400, "QRIS order sudah digunakan untuk transaksi lain")
        if qris_order.get("status") in ("expire", "deny", "cancel"):
            raise HTTPException(400, "QRIS order tidak aktif")
        qris_amount = money(qris_order.get("amount") or 0)
        if total != qris_amount:
            raise HTTPException(
                400,
                f"Total transaksi ({total}) tidak cocok dengan QRIS ({qris_amount}). "
                "Harga produk mungkin berubah setelah QRIS dibuat."
            )

    # =========================================================
    # PAYMENT
    # =========================================================

    amount_paid, change = _validate_payment(
        body.payment_method,
        total,
        body.amount_paid,
        body
    )

    # =========================================================
    # SALE ID
    # =========================================================

    sale_id = new_id()

    # =========================================================
    # INVOICE
    # =========================================================

    invoice_no = (
        f"INV-"
        f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        f"-"
        f"{sale_id[:6].upper()}"
    )

    # =========================================================
    # TRANSFER REFERENCE
    # =========================================================

    transfer_reference_no = None

    if body.payment_method == "transfer":

        transfer_reference_no = (
            f"TRF-"
            f"TAKEAWAY-"
            f"{datetime.now(timezone.utc).strftime('%Y%m%d')}"
            f"-"
            f"{sale_id[:6].upper()}"
        )

    # =========================================================
    # ACTIVE SHIFT
    # =========================================================

    active_shift = await q_one(
        """
        SELECT id
        FROM shifts
        WHERE cashier_id = :c
          AND status = 'open'
        LIMIT 1
        """,
        c=user["id"]
    )

    shift_id = (
        str(active_shift["id"])
        if active_shift
        else None
    )

    # =========================================================
    # OUTLET
    # =========================================================

    outlet_id = (
        _u(body.outlet_id)
        or await _get_main_outlet_id()
    )

    # Outlet access enforcement — prevent cross-outlet sale creation
    # (IDOR). Owner bypasses; non-owner must have outlet_id in their
    # assigned outlet_ids. This mirrors the check used by list_sales.
    if user["role"] != "owner" and outlet_id:
        if str(outlet_id) not in user.get("outlet_ids", []):
            raise HTTPException(
                403,
                "Tidak ada akses ke outlet ini"
            )

    # =========================================================
    # ATOMIC TRANSACTION
    # =========================================================
    #
    # Sales INSERT
    #     +
    # Global stock
    #     +
    # Outlet stock
    #     +
    # Stock movement
    #
    # SEMUANYA commit bersama.
    #
    # Jika salah satu gagal → rollback semua.
    # =========================================================

    async with transaction() as session:

        # -----------------------------------------------------
        # ATOMIC IDEMPOTENCY CLAIM
        # -----------------------------------------------------
        # If the same Idempotency-Key has already been used, return the
        # existing sale. The claim is done inside the same transaction
        # as the sale insert so a concurrent duplicate cannot slip past.
        # -----------------------------------------------------
        ok, existing = await _resolve_idempotency(session, idempotency_key or "", sale_id)
        if not ok:
            if existing:
                return clean(existing)
            raise HTTPException(500, "Idempotensi tidak dapat diproses")

        # -----------------------------------------------------
        # INSERT SALES
        # -----------------------------------------------------

        await _insert_sale(
            session=session,
            sale_id=sale_id,
            invoice_no=invoice_no,
            shift_id=shift_id,
            outlet_id=outlet_id,
            customer_id=body.customer_id,
            user=user,
            items=items,
            subtotal=subtotal,
            discount=money(body.discount),
            tax=money(body.tax),
            total=total,
            payment_method=body.payment_method,
            amount_paid=amount_paid,
            change_amount=change,
            body=body,
            source="pos",
            table_id=None,
            table_name=None,
            transfer_reference_no=transfer_reference_no,
            sales_channel=sales_channel,
            price_type=price_type,
        )

        # -----------------------------------------------------
        # DEDUCT STOCK
        # -----------------------------------------------------

        await _deduct_sale_stock(
            session=session,
            items=items,
            invoice_no=invoice_no,
            outlet_id=outlet_id,
            user_id=user["id"]
        )

        # Tidak ada commit di sini.
        #
        # transaction() akan commit otomatis jika seluruh
        # operasi berhasil.
        #
        # Jika terjadi HTTPException / error:
        # transaction() akan rollback semuanya.

    # =========================================================
    # LINK QRIS ORDER
    # =========================================================
    if qris_order:
        try:
            await q_exec(
                "UPDATE qris_orders SET sale_id=:sid, updated_at=NOW() WHERE order_id=:oid",
                sid=sale_id, oid=body.qris_order_id,
            )
        except Exception:
            pass  # Don't fail the sale if QRIS link update fails

    # =========================================================
    # RETURN
    # =========================================================

    row = await q_one(
        """
        SELECT
            s.*,
            s.change_amount AS change,
            o.name AS outlet_name,
            o.address AS outlet_address,
            o.phone AS outlet_phone
        FROM sales s
        LEFT JOIN outlets o ON s.outlet_id = o.id
        WHERE s.id = :id
        """,
        id=sale_id
    )

    if not row:
        raise HTTPException(
            500,
            "Sale berhasil diproses tetapi data transaksi tidak ditemukan"
        )

    # Emit real-time event
    try:
        from routes.realtime import emit_new_sale
        await emit_new_sale({
            "id": str(row["id"]),
            "invoice_no": row["invoice_no"],
            "total": float(row["total"] or 0),
            "payment_method": row["payment_method"],
            "cashier_name": row["cashier_name"],
            "outlet_name": row.get("outlet_name"),
        }, outlet_id=str(row["outlet_id"]) if row.get("outlet_id") else None)
    except Exception:
        pass  # Don't fail sale if realtime fails

    # Audit log
    try:
        from routes.audit_logs import log_action
        await log_action(user, "create", "sale", entity_id=str(row["id"]),
                         outlet_id=str(row["outlet_id"]) if row.get("outlet_id") else None,
                         new_value={"invoice_no": row["invoice_no"], "total": float(row["total"] or 0)})
    except Exception:
        pass

    # Check for low stock after sale and create alert
    try:
        from routes.alerts import create_alert
        outlet_id_str = str(row["outlet_id"]) if row.get("outlet_id") else None
        if outlet_id_str:
            low_items = await q_all("""
                SELECT p.name, os.quantity, p.low_stock_threshold
                FROM products p
                JOIN outlet_stocks os ON os.product_id = p.id
                WHERE os.outlet_id = :oid AND os.quantity <= p.low_stock_threshold
            """, oid=outlet_id_str)
            for item in low_items:
                await create_alert(
                    category="inventory",
                    severity="critical" if int(item["quantity"] or 0) <= 0 else "warning",
                    title=f"Stok menipis: {item['name']}",
                    message=f"Stok {item['name']} tersisa {item['quantity']} (min: {item['low_stock_threshold']})",
                    outlet_id=outlet_id_str,
                    data={"product_name": item["name"], "quantity": int(item["quantity"] or 0)},
                )
    except Exception:
        pass

    # =========================================================
    # KDS — Create kitchen order ticket
    # =========================================================
    # Send food items to kitchen display. Only items that need
    # kitchen preparation are sent. The kitchen_orders row links
    # to the sale via sale_id and includes the items snapshot.
    # =========================================================
    try:
        kds_items = [
            {"name": it.get("name", ""), "quantity": int(it.get("quantity", 0)),
             "note": it.get("note", ""), "variant_name": it.get("variant_name", "")}
            for it in items
        ]
        if kds_items:
            await q_exec(
                """INSERT INTO kitchen_orders (id, outlet_id, sale_id, invoice_no, items, status, created_at)
                   VALUES (:id, :oid, :sid, :inv, CAST(:it AS jsonb), 'new', NOW())""",
                id=new_id(), oid=_u(outlet_id), sid=sale_id,
                inv=row["invoice_no"], it=json.dumps(kds_items),
            )
    except Exception:
        pass  # KDS creation should not block sale completion

    return clean(row)


@router.get("/sales")
async def list_sales(
    user=Depends(get_current_user),
    limit: int = 200,
    outlet_id: Optional[str] = None
):
    # Build outlet filter
    if outlet_id:
        # Authorization: non-owner can only access assigned outlets
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        o_clause = " AND outlet_id = :outlet_id "
        params = {"l": limit, "outlet_id": outlet_id}
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            o_clause = f" AND outlet_id IN ({ids_sql}) "
            params = {"l": limit}
        else:
            return []
    else:
        o_clause = ""
        params = {"l": limit}

    rows = await q_all(
        f"""
        SELECT
            *,
            change_amount AS change
        FROM sales
        WHERE 1=1
          {o_clause}
        ORDER BY created_at DESC
        LIMIT :l
        """,
        **params
    )

    return clean_list(rows)


@router.get("/sales/{sale_id}")
async def get_sale(
    sale_id: str,
    user=Depends(get_current_user)
):
    outlet_filter = await filter_outlets_for_user(user)
    row = await q_one(
        f"""
        SELECT
            s.*,
            s.change_amount AS change,
            o.name AS outlet_name,
            o.address AS outlet_address,
            o.phone AS outlet_phone
        FROM sales s
        LEFT JOIN outlets o ON s.outlet_id = o.id
        WHERE s.id=:id {outlet_filter}
        """,
        id=sale_id
    )

    if not row:
        raise HTTPException(
            404,
            "Not found"
        )

    return clean(row)


# ============================================================
# VOID / CANCEL SALE
# ============================================================
# Voids a completed sale: marks status='voided', restores stock,
# creates reverse stock movements, and logs an audit entry.
# The sale record is preserved for audit (no hard delete).
# ============================================================
@router.post("/sales/{sale_id}/void")
async def void_sale(
    sale_id: str,
    body: dict,
    user=Depends(require_role("owner", "admin", "manager", "supervisor")),
):
    """Void a completed sale. Restores stock and creates audit log."""
    sale = await q_one("SELECT * FROM sales WHERE id=:id", id=sale_id)
    if not sale:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner" and sale.get("outlet_id"):
        if str(sale["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    if sale.get("status") == "voided":
        raise HTTPException(400, "Transaksi sudah dibatalkan")

    reason = body.get("reason", "")
    items = sale["items"] if isinstance(sale["items"], list) else json.loads(sale["items"])

    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        # Mark sale as voided
        r = await _tx_execute(
            session,
            """UPDATE sales SET status='voided', voided_by=:uid, voided_at=NOW(), void_reason=:reason
               WHERE id=:id AND (status='completed' OR status IS NULL)""",
            uid=user["id"], reason=reason, id=sale_id,
        )
        if r.rowcount == 0:
            raise HTTPException(400, "Transaksi tidak bisa dibatalkan (kemungkinan sudah void)")

        # Restore stock for each item
        for it in items:
            qty = int(it.get("quantity", 0))
            if qty <= 0:
                continue
            pid = it.get("product_id")
            if not pid:
                continue

            # Restore global stock
            await _tx_execute(
                session,
                "UPDATE products SET stock = stock + :q, updated_at = NOW() WHERE id = :id",
                q=qty, id=pid,
            )

            # Restore outlet stock
            if sale.get("outlet_id"):
                await _tx_execute(
                    session,
                    """INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                       VALUES (:p, :o, :q, NOW())
                       ON CONFLICT (product_id, outlet_id)
                       DO UPDATE SET quantity = outlet_stocks.quantity + :q, updated_at = NOW()""",
                    p=pid, o=sale["outlet_id"], q=qty,
                )

            # Reverse stock movement
            await _tx_execute(
                session,
                """INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                   VALUES (:id, :pid, :pn, :d, 'void', :note, :oid, :u, NOW())""",
                id=new_id(), pid=pid, pn=it.get("name", ""),
                d=qty, note=f"Void sale {sale['invoice_no']}",
                oid=_u(sale.get("outlet_id")), u=user["id"],
            )

    # Audit log
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "SALE_VOIDED", "sales", entity_id=sale_id,
            outlet_id=sale.get("outlet_id"),
            new_value={"invoice_no": sale.get("invoice_no"), "reason": reason,
                       "voided_by": user.get("name", "")},
        )
    except Exception:
        pass

    return {"ok": True, "message": f"Transaksi {sale['invoice_no']} dibatalkan"}


# ============================================================
# REPRINT RECEIPT
# ============================================================
# Returns the sale data for receipt reprinting. Does NOT create
# a new transaction, does NOT deduct stock, does NOT create a
# new payment. Only logs the reprint action for audit.
# ============================================================
@router.get("/sales/{sale_id}/reprint")
async def reprint_receipt(
    sale_id: str,
    user=Depends(get_current_user),
):
    """Get sale data for receipt reprinting."""
    sale = await q_one(
        """SELECT s.*, s.change_amount AS change, o.name AS outlet_name,
                  o.address AS outlet_address, o.phone AS outlet_phone
           FROM sales s
           LEFT JOIN outlets o ON s.outlet_id = o.id
           WHERE s.id=:id""",
        id=sale_id,
    )
    if not sale:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner" and sale.get("outlet_id"):
        if str(sale["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    # Log reprint for audit
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "RECEIPT_REPRINTED", "sales", entity_id=sale_id,
            outlet_id=sale.get("outlet_id"),
            new_value={"invoice_no": sale.get("invoice_no"),
                       "reprinted_by": user.get("name", "")},
        )
    except Exception:
        pass

    return clean(sale)
