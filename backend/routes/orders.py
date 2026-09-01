"""Orders routes — Dine-in orders and checkout."""
import json
from routes.deps import *
from routes.inventory import _get_main_outlet_id, _adjust_outlet_stock
from routes.sales import (
    _validate_sale_total,
    _validate_payment,
    _build_payment_values,
    _deduct_sale_stock,
    _insert_sale,
)
from services.order_service import _calc_total
from services.pricing_service import resolve_product_price

router = APIRouter()

# Model aliases — server.py used OrderOpenIn / OrderUpdateItemsIn / OrderCheckoutIn
OrderOpenIn = OrderCreate
OrderUpdateItemsIn = OrderUpdate
OrderCheckoutIn = OrderCheckout


@router.get("/orders")
async def list_orders(status: Optional[str] = None, user=Depends(get_current_user)):
    if status:
        rows = await q_all("SELECT * FROM orders WHERE status=:s ORDER BY opened_at DESC LIMIT 500", s=status)
    else:
        rows = await q_all("SELECT * FROM orders ORDER BY opened_at DESC LIMIT 500")
    return clean_list(rows)

@router.post("/orders")
async def open_order(body: OrderOpenIn, user=Depends(get_current_user)):
    table = await q_one("SELECT * FROM tables WHERE id=:id", id=body.table_id)
    if not table: raise HTTPException(404, "Meja tidak ditemukan")
    existing = await q_one("SELECT id FROM orders WHERE table_id=:t AND status='open'", t=body.table_id)
    if existing: raise HTTPException(400, "Meja sudah memiliki order terbuka")
    items = [i.model_dump() for i in (body.items or [])]
    oid = new_id()
    await q_exec("""INSERT INTO orders (id, order_no, table_id, table_name, outlet_id, guest_count, items, total,
                                          status, cashier_id, cashier_name, opened_at)
                    VALUES (:id, :ono, :tid, :tn, :oid, :g, CAST(:it AS jsonb), :tot, 'open', :ci, :cn, NOW())""",
                 id=oid, ono=f"ORD-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                 tid=body.table_id, tn=table["name"], oid=_u(body.outlet_id or table.get("outlet_id")),
                 g=body.guest_count, it=json.dumps([item.model_dump() for item in body.items]), tot=_calc_total(items),
                 ci=user["id"], cn=user.get("name",""))
    await q_exec("UPDATE tables SET status='occupied' WHERE id=:id", id=body.table_id)
    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=oid))

@router.put("/orders/{order_id}/items")
async def update_order_items(order_id: str, body: OrderUpdateItemsIn, user=Depends(get_current_user)):
    order = await q_one("SELECT status FROM orders WHERE id=:id", id=order_id)
    if not order or order["status"] != "open": raise HTTPException(400, "Order tidak aktif")
    items = [i.model_dump() for i in body.items]
    await q_exec("UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id",
                 it=json.dumps([item.model_dump() for item in body.items]), t=_calc_total(items), id=order_id)
    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=order_id))

@router.post("/orders/{order_id}/checkout")
async def checkout_order(
    order_id: str,
    body: OrderCheckoutIn,
    user=Depends(get_current_user)
):
    order = await q_one(
        "SELECT * FROM orders WHERE id=:id",
        id=order_id
    )

    if not order or order["status"] != "open":
        raise HTTPException(400, "Order tidak aktif")

    items = (
        order["items"]
        if isinstance(order["items"], list)
        else json.loads(order["items"])
    )

    if not items:
        raise HTTPException(400, "Order kosong")

    # =========================================================
    # BACKEND PRICE RESOLUTION
    # =========================================================
    sales_channel = getattr(body, "sales_channel", "offline") or "offline"
    price_type = getattr(body, "price_type", "ecceran") or "ecceran"

    resolved_items = []
    for it in items:
        pid = str(it.get("product_id") or "")
        if not pid:
            resolved_items.append(it)
            continue

        product = await q_one(
            """
            SELECT id, name, price, variants,
                   retail_price, reseller_price, wholesale_price, online_price
            FROM products WHERE id=:id
            """,
            id=pid
        )

        if not product:
            resolved_items.append(it)
            continue

        variants = product.get("variants")
        if variants is None:
            variants = []
        elif isinstance(variants, str):
            try:
                variants = json.loads(variants)
            except Exception:
                variants = []

        product_for_pricing = {
            "price": float(product["price"] or 0),
            "retail_price": product.get("retail_price"),
            "reseller_price": product.get("reseller_price"),
            "wholesale_price": product.get("wholesale_price"),
            "online_price": product.get("online_price"),
            "variants": variants,
        }

        resolved_price = await resolve_product_price(
            product_for_pricing,
            variant_name=it.get("variant_name") or "",
            sales_channel=sales_channel,
            price_type=price_type,
        )

        it["price"] = resolved_price
        it["price_type"] = price_type
        it["sales_channel"] = sales_channel
        resolved_items.append(it)

    items = resolved_items

    subtotal = _calc_total(items)
    total = subtotal - body.discount + body.tax

    if total < 0:
        total = 0

        # =========================================================
    # VALIDASI PEMBAYARAN
    # =========================================================

    # ---------------------------------------------------------
    # CASH
    # ---------------------------------------------------------
    if body.payment_method == "cash":

        if body.amount_paid < total:
            raise HTTPException(
                400,
                "Uang bayar kurang"
            )

        amount_paid = body.amount_paid


    # ---------------------------------------------------------
    # CARD
    # ---------------------------------------------------------
    elif body.payment_method == "card":

        if not body.card_type:
            raise HTTPException(
                400,
                "Jenis kartu wajib diisi"
            )

        if not body.card_brand:
            raise HTTPException(
                400,
                "Bank/brand kartu wajib diisi"
            )

        if not body.card_last4:
            raise HTTPException(
                400,
                "4 digit terakhir kartu wajib diisi"
            )

        if len(body.card_last4) != 4:
            raise HTTPException(
                400,
                "4 digit terakhir kartu harus tepat 4 digit"
            )

        if not body.card_reference_no:
            raise HTTPException(
                400,
                "No. referensi kartu wajib diisi"
            )

        amount_paid = total


    # ---------------------------------------------------------
    # QRIS
    # ---------------------------------------------------------
    elif body.payment_method == "qris":

        amount_paid = total


    # ---------------------------------------------------------
    # TRANSFER
    # ---------------------------------------------------------
    elif body.payment_method == "transfer":

        if not body.transfer_bank:
            raise HTTPException(
                400,
                "Bank tujuan transfer wajib dipilih"
            )

        if not body.transfer_account_name:
            raise HTTPException(
                400,
                "Nama rekening tujuan wajib diisi"
            )

        if not body.transfer_account_no:
            raise HTTPException(
                400,
                "Nomor rekening tujuan wajib diisi"
            )

        if not body.transfer_sender_name:
            raise HTTPException(
                400,
                "Nama pengirim wajib diisi"
            )

        amount_paid = total


    # ---------------------------------------------------------
    # PAYMENT METHOD TIDAK DIKENAL
    # ---------------------------------------------------------
    else:

        raise HTTPException(
            400,
            "Metode pembayaran tidak valid"
        )

    # Validasi stok
    for it in items:
        p = await q_one(
            "SELECT stock, name FROM products WHERE id=:id",
            id=it["product_id"]
        )

        if not p or p["stock"] < it["quantity"]:
            raise HTTPException(
                400,
                f"Stok kurang untuk {it['name']}"
            )

    change = max(0, amount_paid - total)

    sale_id = new_id()

    # =========================================================
    # GENERATE REFERENCE TRANSFER
    # =========================================================
    transfer_reference_no = None
    if body.payment_method == "transfer":
        order_no_short = str(
            order["order_no"]
        ).replace("ORD-", "")
        transfer_reference_no = (
            f"TRF-"
            f"{order_no_short}-"
            f"{sale_id[:6].upper()}"
        )
    invoice_no = (
        f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        f"-{sale_id[:6].upper()}"
    )

    active_shift = await q_one(
        """
        SELECT id
        FROM shifts
        WHERE cashier_id=:c
          AND status='open'
        LIMIT 1
        """,
        c=user["id"]
    )

    shift_id = (
        str(active_shift["id"])
        if active_shift
        else None
    )

    outlet_id = _u(body.outlet_id) or await _get_main_outlet_id()

    # Simpan transaksi
    await q_exec(
        """
                INSERT INTO sales (
            id,
            invoice_no,
            shift_id,
            outlet_id,
            customer_id,
            cashier_id,
            cashier_name,

            items,
            subtotal,
            discount,
            tax,
            total,

            payment_method,
            amount_paid,
            change_amount,

            -- CARD
            card_type,
            card_brand,
            card_last4,
            card_reference_no,
            card_approval_code,
            card_terminal_id,

            -- TRANSFER
            transfer_bank,
            transfer_account_name,
            transfer_account_no,
            transfer_reference_no,
            transfer_sender_name,
            transfer_verified,

            -- GENERAL PAYMENT
            payment_reference,

            source,
            table_id,
            table_name,
            note,
            sales_channel,
            price_type,
            created_at
        )
                VALUES (
            :id,
            :inv,
            :sid,
            :oid,
            :cid,
            :ci,
            :cn,

            CAST(:it AS jsonb),
            :sub,
            :disc,
            :tax,
            :tot,

            :pm,
            :paid,
            :chg,

            -- CARD
            :ct,
            :cb,
            :cl4,
            :cr,
            :ca,
            :terminal,

            -- TRANSFER
            :tb,
            :tan,
            :ta,
            :tr,
            :tsn,
            :tv,

            -- GENERAL PAYMENT
            :payment_ref,

            'dine-in',
            :tid,
            :tn,
            :note,
            :sc,
            :pt,
            NOW()
        )
        """,
        id=sale_id,
        inv=invoice_no,

        sid=_u(shift_id),
        oid=_u(outlet_id),
        cid=_u(body.customer_id),

        ci=user["id"],
        cn=user.get("name", ""),

        it=json.dumps(items),

        sub=subtotal,
        disc=body.discount,
        tax=body.tax,
        tot=total,

        pm=body.payment_method,
        paid=amount_paid,
        chg=change,

        # =====================================================
        # CARD
        # =====================================================

        ct=(
            _u(body.card_type)
            if body.payment_method == "card"
            else None
        ),

        cb=(
            _u(body.card_brand)
            if body.payment_method == "card"
            else None
        ),

        cl4=(
            _u(body.card_last4)
            if body.payment_method == "card"
            else None
        ),

        cr=(
            _u(body.card_reference_no)
            if body.payment_method == "card"
            else None
        ),

        ca=(
            _u(body.card_approval_code)
            if body.payment_method == "card"
            else None
        ),

        terminal=(
            _u(body.card_terminal_id)
            if body.payment_method == "card"
            else None
        ),

        # =====================================================
        # TRANSFER
        # =====================================================

        tb=(
            _u(body.transfer_bank)
            if body.payment_method == "transfer"
            else None
        ),

        tan=(
            _u(body.transfer_account_name)
            if body.payment_method == "transfer"
            else None
        ),

        ta=(
            _u(body.transfer_account_no)
            if body.payment_method == "transfer"
            else None
        ),

        tr=(
            transfer_reference_no
            if body.payment_method == "transfer"
            else None
        ),

        tsn=(
            _u(body.transfer_sender_name)
            if body.payment_method == "transfer"
            else None
        ),

        tv=(
            body.transfer_verified
            if body.payment_method == "transfer"
            else False
        ),

        # =====================================================
        # GENERAL PAYMENT REFERENCE
        # =====================================================

        payment_ref=(
            transfer_reference_no
            if body.payment_method == "transfer"
            else (
                _u(body.card_reference_no)
                if body.payment_method == "card"
                else None
            )
        ),

        # =====================================================
        # TABLE
        # =====================================================

        tid=_u(str(order["table_id"])),

        tn=None,

        note=_u(body.note),

        sc=getattr(body, "sales_channel", "offline") or "offline",
        pt=getattr(body, "price_type", "ecceran") or "ecceran",
    )

    # Kurangi stok
    for it in items:
        await q_exec(
            """
            UPDATE products
            SET stock = stock - :q,
                updated_at = NOW()
            WHERE id = :id
            """,
            q=it["quantity"],
            id=it["product_id"]
        )

        if outlet_id:
            await _adjust_outlet_stock(
                it["product_id"],
                outlet_id,
                -it["quantity"]
            )

        await q_exec(
            """
            INSERT INTO stock_movements (
                id,
                product_id,
                product_name,
                delta,
                reason,
                note,
                outlet_id,
                user_id,
                created_at
            )
            VALUES (
                :id,
                :pid,
                :pn,
                :d,
                'sale',
                :note,
                :oid,
                :u,
                NOW()
            )
            """,
            id=new_id(),
            pid=it["product_id"],
            pn=it["name"],
            d=-it["quantity"],
            note=f"Sale {invoice_no}",
            oid=_u(outlet_id),
            u=user["id"]
        )

    # Tutup order
    await q_exec(
        """
        UPDATE orders
        SET status='closed',
            closed_at=NOW(),
            sale_id=:sid
        WHERE id=:id
        """,
        sid=sale_id,
        id=order_id
    )

    # Bebaskan meja
    await q_exec(
        """
        UPDATE tables
        SET status='available'
        WHERE id=:id
        """,
        id=order["table_id"]
    )

    # Ambil hasil transaksi
    row = await q_one(
        """
        SELECT *,
               change_amount AS change
        FROM sales
        WHERE id=:id
        """,
        id=sale_id
    )

    return clean(row)

@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str, user=Depends(get_current_user)):
    order = await q_one("SELECT table_id, status FROM orders WHERE id=:id", id=order_id)
    if not order: raise HTTPException(404, "Not found")
    if order["status"] != "open": raise HTTPException(400, "Order sudah selesai")
    await q_exec("UPDATE orders SET status='cancelled', closed_at=NOW() WHERE id=:id", id=order_id)
    await q_exec("UPDATE tables SET status='available' WHERE id=:id", id=order["table_id"])
    return {"ok": True}
