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

    return clean(row)


@router.get("/sales")
async def list_sales(
    user=Depends(get_current_user),
    limit: int = 200
):
    rows = await q_all(
        """
        SELECT
            *,
            change_amount AS change
        FROM sales
        ORDER BY created_at DESC
        LIMIT :l
        """,
        l=limit
    )

    return clean_list(rows)


@router.get("/sales/{sale_id}")
async def get_sale(
    sale_id: str,
    user=Depends(get_current_user)
):
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
        WHERE s.id=:id
        """,
        id=sale_id
    )

    if not row:
        raise HTTPException(
            404,
            "Not found"
        )

    return clean(row)
