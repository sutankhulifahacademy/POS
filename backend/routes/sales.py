"""Sales routes — POS transactions, takeaway sales."""
import json
from routes.deps import *
from routes.inventory import _get_main_outlet_id
from services.sales_service import (
    _validate_sale_total,
    _validate_payment,
    _build_payment_values,
    _validate_and_get_sale_items,
    _deduct_sale_stock,
    _insert_sale,
)

router = APIRouter()


@router.post("/sales")
async def create_sale(
    body: SaleCreate,
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
    # VALIDASI ITEMS + STOCK
    # =========================================================

    items, subtotal = await _validate_and_get_sale_items(
        body.items
    )

    # =========================================================
    # TOTAL
    # =========================================================

    total = _validate_sale_total(
        subtotal,
        body.discount,
        body.tax
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
            discount=body.discount,
            tax=body.tax,
            total=total,
            payment_method=body.payment_method,
            amount_paid=amount_paid,
            change_amount=change,
            body=body,
            source="pos",
            table_id=None,
            table_name=None,
            transfer_reference_no=transfer_reference_no
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
