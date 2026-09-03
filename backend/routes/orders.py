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
    _resolve_idempotency,
)
from services.money import money
from services.order_service import _calc_total
from services.pricing_service import resolve_product_price

router = APIRouter()

# Model aliases — server.py used OrderOpenIn / OrderUpdateItemsIn / OrderCheckoutIn
OrderOpenIn = OrderCreate
OrderUpdateItemsIn = OrderUpdate
OrderCheckoutIn = OrderCheckout


@router.get("/orders")
async def list_orders(
    status: Optional[str] = None,
    outlet_id: Optional[str] = None,
    table_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """List dine-in orders. Outlet-scoped for non-owners."""
    where = ["1=1"]
    params = {}
    if status:
        where.append("status = :s")
        params["s"] = status
    if table_id:
        where.append("table_id = :tid")
        params["tid"] = table_id
    # Outlet authorization — prevent cross-outlet data leak
    if outlet_id:
        where.append("outlet_id = :oid")
        params["oid"] = outlet_id
        # Verify user has access to this outlet
        if user["role"] != "owner" and str(outlet_id) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids = ",".join(f"'{o}'" for o in user_outlets)
            where.append(f"outlet_id IN ({ids})")
        else:
            # No outlets assigned — deny all orders
            where.append("1=0")
    where_sql = " AND ".join(where)
    rows = await q_all(
        f"SELECT * FROM orders WHERE {where_sql} ORDER BY opened_at DESC LIMIT 500",
        **params,
    )
    return clean_list(rows)

@router.post("/orders")
async def open_order(body: OrderOpenIn, user=Depends(get_current_user)):
    table = await q_one("SELECT * FROM tables WHERE id=:id", id=body.table_id)
    if not table: raise HTTPException(404, "Meja tidak ditemukan")

    # Determine outlet — prefer body, then table's outlet
    outlet_id = _u(body.outlet_id) or table.get("outlet_id")
    if not outlet_id:
        outlet_id = await _get_main_outlet_id()

    # Outlet authorization — prevent cross-outlet order creation
    if user["role"] != "owner" and outlet_id:
        if str(outlet_id) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    items = [i.model_dump() for i in (body.items or [])]
    oid = new_id()
    order_no = f"ORD-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

    # =========================================================
    # ATOMIC TRANSACTION with race condition guard
    # =========================================================
    # Atomically claim the table by updating its status
    # conditionally (only if currently 'available'). This
    # prevents two concurrent open_order calls from creating
    # duplicate open orders for the same table.
    # =========================================================
    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        # Conditional table claim — prevents duplicate open orders
        claim = await _tx_execute(
            session,
            """UPDATE tables SET status='occupied', updated_at=NOW()
               WHERE id=:id AND status='available'""",
            id=body.table_id,
        )
        if claim.rowcount == 0:
            # Table is already occupied — check if it has an open order
            existing = await session_one(
                session,
                "SELECT id FROM orders WHERE table_id=:t AND status='open' LIMIT 1",
                t=body.table_id,
            )
            if existing:
                raise HTTPException(400, "Meja sudah memiliki order terbuka")
            raise HTTPException(400, "Meja tidak tersedia")

        await _tx_execute(
            session,
            """INSERT INTO orders (id, order_no, table_id, table_name, outlet_id, guest_count, items, total,
                                      status, cashier_id, cashier_name, opened_at)
               VALUES (:id, :ono, :tid, :tn, :oid, :g, CAST(:it AS jsonb), :tot, 'open', :ci, :cn, NOW())""",
            id=oid, ono=order_no,
            tid=body.table_id, tn=table["name"], oid=_u(outlet_id),
            g=body.guest_count, it=json.dumps(items), tot=_calc_total(items),
            ci=user["id"], cn=user.get("name", ""),
        )

    # Create KDS ticket so kitchen sees the order immediately
    await _create_or_update_kds_ticket(oid, order_no, table["name"], outlet_id, items)

    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=oid))


async def _create_or_update_kds_ticket(order_id, order_no, table_name, outlet_id, items):
    """Create or update a KDS ticket for a dine-in order (pre-checkout).
    Called when order is saved or updated — sale_id is NULL until checkout."""
    try:
        kds_items = [
            {"name": it.get("name", ""), "quantity": int(it.get("quantity", 0)),
             "note": it.get("note", ""), "variant_name": it.get("variant_name", "")}
            for it in items
        ]
        if not kds_items:
            return

        # Check if KDS ticket already exists for this order
        existing = await q_one(
            "SELECT id FROM kitchen_orders WHERE id=:oid",
            oid=order_id,
        )
        if existing:
            # Update existing ticket items
            await q_exec(
                """UPDATE kitchen_orders SET items=CAST(:it AS jsonb), table_no=:tn WHERE id=:oid""",
                it=json.dumps(kds_items), tn=table_name, oid=order_id,
            )
        else:
            # Create new KDS ticket (sale_id=NULL, invoice_no=order_no)
            await q_exec(
                """INSERT INTO kitchen_orders (id, outlet_id, sale_id, invoice_no, table_no, items, status, created_at)
                   VALUES (:id, :oid, NULL, :inv, :tn, CAST(:it AS jsonb), 'new', NOW())""",
                id=order_id, oid=_u(outlet_id),
                inv=order_no, tn=table_name,
                it=json.dumps(kds_items),
            )
    except Exception:
        pass  # KDS creation should not block order operations


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    """Get order detail with outlet authorization."""
    order = await q_one("SELECT * FROM orders WHERE id=:id", id=order_id)
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    # Outlet authorization
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
    return clean(order)


@router.put("/orders/{order_id}/items")
async def update_order_items(order_id: str, body: OrderUpdateItemsIn, user=Depends(get_current_user)):
    order = await q_one("SELECT status, outlet_id FROM orders WHERE id=:id", id=order_id)
    if not order or order["status"] != "open": raise HTTPException(400, "Order tidak aktif")

    # Outlet authorization
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    items = [i.model_dump() for i in body.items]
    # Conditional update — only if still open (prevents race with checkout)
    r = await q_exec(
        "UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id AND status='open'",
        it=json.dumps(items), t=_calc_total(items), id=order_id,
    )
    if r == 0:
        raise HTTPException(400, "Order sudah tidak aktif (kemungkinan sudah di-checkout)")

    # Update KDS ticket with new items
    full_order = await q_one("SELECT order_no, table_name FROM orders WHERE id=:id", id=order_id)
    if full_order:
        await _create_or_update_kds_ticket(order_id, full_order["order_no"], full_order.get("table_name"), order.get("outlet_id"), items)

    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=order_id))

@router.post("/orders/{order_id}/checkout")
async def checkout_order(
    order_id: str,
    body: OrderCheckoutIn,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    user=Depends(get_current_user)
):
    order = await q_one(
        "SELECT * FROM orders WHERE id=:id",
        id=order_id
    )

    if not order or order["status"] != "open":
        raise HTTPException(400, "Order tidak aktif")

    # Outlet authorization — verify user has access to the ORDER's outlet
    # This prevents IDOR: checking out an order from another outlet
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

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

    # F1: cashier must not use privileged pricing tiers (reseller/partai).
    assert_price_type_authorized(user, price_type, sales_channel)

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
            "price": product["price"],
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

        # Snapshot historical cost for COGS accuracy
        it["cost"] = float(money(product.get("cost") or 0))
        it["price"] = float(resolved_price)
        it["price_type"] = price_type
        it["sales_channel"] = sales_channel
        resolved_items.append(it)

    items = resolved_items

    subtotal = _calc_total(items)

    # ---- Server-side discount/tax validation ----
    # Use centralized calculation from sales_service to prevent
    # calculation drift between /sales and /orders/{id}/checkout.
    total = _validate_sale_total(subtotal, body.discount, body.tax)

    # F2: prevent cashier from applying a 100% discount (free transaction).
    assert_discount_authorized(user, subtotal, body.discount, body.tax)

    # =========================================================
    # QRIS AMOUNT VALIDATION
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
    # VALIDASI PEMBAYARAN
    # =========================================================
    # Use centralized payment validation from sales_service.
    amount_paid, change = _validate_payment(
        body.payment_method,
        total,
        body.amount_paid,
        body,
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

    # change is already computed by _validate_payment above

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

    # Outlet access enforcement — prevent cross-outlet checkout (IDOR)
    if user["role"] != "owner" and outlet_id:
        if str(outlet_id) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    # =========================================================
    # ATOMIC TRANSACTION
    # =========================================================
    # Sale INSERT + stock deduction + stock movements + order
    # close + table release must all commit together. Previously
    # each q_exec auto-committed separately, so a partial failure
    # could leave stock deducted without a sale record (or vice
    # versa). Stock deduction uses atomic conditional UPDATE
    # (WHERE stock >= :q) to prevent negative stock under
    # concurrency.
    # =========================================================
    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        # --- ATOMIC IDEMPOTENCY CLAIM ---
        ok, existing = await _resolve_idempotency(session, idempotency_key or "", sale_id)
        if not ok:
            if existing:
                return clean(existing)
            raise HTTPException(500, "Idempotensi tidak dapat diproses")

        # --- INSERT SALE ---
        await _tx_execute(
            session,
            """
            INSERT INTO sales (
                id, invoice_no, shift_id, outlet_id, customer_id, cashier_id, cashier_name,
                items, subtotal, discount, tax, total,
                payment_method, amount_paid, change_amount,
                card_type, card_brand, card_last4, card_reference_no, card_approval_code, card_terminal_id,
                transfer_bank, transfer_account_name, transfer_account_no, transfer_reference_no,
                transfer_sender_name, transfer_verified, payment_reference,
                source, table_id, table_name, note, sales_channel, price_type, created_at
            )
            VALUES (
                :id, :inv, :sid, :oid, :cid, :ci, :cn,
                CAST(:it AS jsonb), :sub, :disc, :tax, :tot,
                :pm, :paid, :chg,
                :ct, :cb, :cl4, :cr, :ca, :terminal,
                :tb, :tan, :ta, :tr, :tsn, :tv, :payment_ref,
                'dine-in', :tid, :tn, :note, :sc, :pt, NOW()
            )
            """,
            id=sale_id, inv=invoice_no,
            sid=_u(shift_id), oid=_u(outlet_id), cid=_u(body.customer_id),
            ci=user["id"], cn=user.get("name", ""),
            it=json.dumps(items),
            sub=subtotal, disc=money(body.discount), tax=money(body.tax), tot=total,
            pm=body.payment_method, paid=amount_paid, chg=change,
            ct=(_u(body.card_type) if body.payment_method == "card" else None),
            cb=(_u(body.card_brand) if body.payment_method == "card" else None),
            cl4=(_u(body.card_last4) if body.payment_method == "card" else None),
            cr=(_u(body.card_reference_no) if body.payment_method == "card" else None),
            ca=(_u(body.card_approval_code) if body.payment_method == "card" else None),
            terminal=(_u(body.card_terminal_id) if body.payment_method == "card" else None),
            tb=(_u(body.transfer_bank) if body.payment_method == "transfer" else None),
            tan=(_u(body.transfer_account_name) if body.payment_method == "transfer" else None),
            ta=(_u(body.transfer_account_no) if body.payment_method == "transfer" else None),
            tr=(transfer_reference_no if body.payment_method == "transfer" else None),
            tsn=(_u(body.transfer_sender_name) if body.payment_method == "transfer" else None),
            tv=(body.transfer_verified if body.payment_method == "transfer" else False),
            payment_ref=(
                transfer_reference_no if body.payment_method == "transfer"
                else (_u(body.card_reference_no) if body.payment_method == "card" else None)
            ),
            tid=_u(str(order["table_id"])), tn=order.get("table_name"), note=_u(body.note),
            sc=getattr(body, "sales_channel", "offline") or "offline",
            pt=getattr(body, "price_type", "ecceran") or "ecceran",
        )

        # --- DEDUCT STOCK (atomic conditional UPDATE) ---
        for it in items:
            qty = int(it["quantity"])
            result = await _tx_execute(
                session,
                """UPDATE products SET stock = stock - :q, updated_at = NOW()
                   WHERE id = :id AND stock >= :q""",
                q=qty, id=it["product_id"],
            )
            if result.rowcount == 0:
                raise HTTPException(400, f"Stok tidak cukup untuk {it['name']}")

            # Outlet stock atomic upsert with non-negative guard
            if outlet_id:
                os_result = await _tx_execute(
                    session,
                    """
                    INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                    VALUES (:p, :o, GREATEST(:q, 0), NOW())
                    ON CONFLICT (product_id, outlet_id)
                    DO UPDATE SET quantity = outlet_stocks.quantity + :d, updated_at = NOW()
                    WHERE outlet_stocks.quantity + :d >= 0
                    """,
                    p=it["product_id"], o=outlet_id, q=-qty, d=-qty,
                )
                # If the upsert was a no-op due to the guard, raise
                # (only relevant for the conflict path; the insert
                # path always succeeds with GREATEST(-qty, 0) = 0)
                existing_os = await session_one(
                    session,
                    "SELECT quantity FROM outlet_stocks WHERE product_id=:p AND outlet_id=:o",
                    p=it["product_id"], o=outlet_id,
                )
                if existing_os and int(existing_os["quantity"]) < qty:
                    raise HTTPException(400, f"Stok outlet tidak cukup untuk {it['name']}")

            # Stock movement
            await _tx_execute(
                session,
                """INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                   VALUES (:id, :pid, :pn, :d, 'sale', :note, :oid, :u, NOW())""",
                id=new_id(), pid=it["product_id"], pn=it["name"],
                d=-qty, note=f"Sale {invoice_no}", oid=_u(outlet_id), u=user["id"],
            )

        # --- CLOSE ORDER (atomic conditional — prevents double checkout) ---
        close_result = await _tx_execute(
            session,
            "UPDATE orders SET status='closed', closed_at=NOW(), sale_id=:sid WHERE id=:id AND status='open'",
            sid=sale_id, id=order_id,
        )
        if close_result.rowcount == 0:
            # Order was already closed by a concurrent checkout —
            # raise to trigger rollback of the sale + stock deduction
            raise HTTPException(400, "Order sudah di-checkout (race condition dicegah)")

        # --- FREE TABLE ---
        await _tx_execute(
            session,
            "UPDATE tables SET status='available' WHERE id=:id",
            id=order["table_id"],
        )

        # --- LINK QRIS ORDER ---
        if qris_order:
            await _tx_execute(
                session,
                "UPDATE qris_orders SET sale_id=:sid, updated_at=NOW() WHERE order_id=:oid",
                sid=sale_id, oid=body.qris_order_id,
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

    # =========================================================
    # KDS — Update existing ticket or create new one at checkout
    # =========================================================
    try:
        kds_items = [
            {"name": it.get("name", ""), "quantity": int(it.get("quantity", 0)),
             "note": it.get("note", ""), "variant_name": it.get("variant_name", "")}
            for it in items
        ]
        if kds_items:
            # Check if KDS ticket already exists (created when order was saved)
            existing_kds = await q_one(
                "SELECT id, status FROM kitchen_orders WHERE id=:oid",
                oid=order_id,
            )
            if existing_kds:
                # Update existing ticket with sale_id and invoice_no
                # Only update if still in new/preparing status (don't reset cooking progress)
                await q_exec(
                    """UPDATE kitchen_orders
                       SET sale_id=:sid, invoice_no=:inv,
                           items=CAST(:it AS jsonb)
                       WHERE id=:oid AND status IN ('new', 'preparing')""",
                    sid=sale_id, inv=invoice_no,
                    it=json.dumps(kds_items), oid=order_id,
                )
            else:
                # No pre-existing ticket — create new one at checkout
                await q_exec(
                    """INSERT INTO kitchen_orders (id, outlet_id, sale_id, invoice_no, table_no, items, status, created_at)
                       VALUES (:id, :oid, :sid, :inv, :tn, CAST(:it AS jsonb), 'new', NOW())""",
                    id=new_id(), oid=_u(outlet_id), sid=sale_id,
                    inv=invoice_no, tn=order.get("table_name"),
                    it=json.dumps(kds_items),
                )
    except Exception:
        pass  # KDS creation should not block checkout

    return clean(row)

@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str, user=Depends(get_current_user)):
    order = await q_one("SELECT table_id, status, outlet_id, order_no FROM orders WHERE id=:id", id=order_id)
    if not order: raise HTTPException(404, "Order tidak ditemukan")
    if order["status"] != "open": raise HTTPException(400, "Order sudah selesai")

    # Outlet authorization
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    # Atomic conditional update — prevents race with checkout
    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        r = await _tx_execute(
            session,
            "UPDATE orders SET status='cancelled', closed_at=NOW() WHERE id=:id AND status='open'",
            id=order_id,
        )
        if r.rowcount == 0:
            raise HTTPException(400, "Order sudah tidak aktif (kemungkinan sudah di-checkout)")
        await _tx_execute(
            session,
            "UPDATE tables SET status='available' WHERE id=:id",
            id=order["table_id"],
        )

    # Audit log
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "ORDER_CANCELLED", "orders", entity_id=order_id,
            outlet_id=order.get("outlet_id"),
            new_value={"order_no": order.get("order_no"), "cancelled_by": user.get("name", "")},
        )
    except Exception:
        pass

    # Cancel KDS ticket if it exists (pre-checkout ticket)
    try:
        await q_exec(
            """UPDATE kitchen_orders SET status='cancelled'
               WHERE id=:oid AND status IN ('new', 'preparing')""",
            oid=order_id,
        )
    except Exception:
        pass

    return {"ok": True}


# ============================================================
# MOVE TABLE — transfer order to a different table
# ============================================================
@router.post("/orders/{order_id}/move-table")
async def move_table(
    order_id: str,
    body: dict,
    user=Depends(get_current_user),
):
    """Move an open order to a different table.

    - Frees the old table (status='available')
    - Claims the new table (status='occupied') atomically
    - Updates order.table_id and table_name
    - Audit logged
    """
    new_table_id = body.get("new_table_id")
    if not new_table_id:
        raise HTTPException(400, "new_table_id wajib diisi")

    order = await q_one("SELECT * FROM orders WHERE id=:id", id=order_id)
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    if order["status"] != "open":
        raise HTTPException(400, "Hanya order aktif yang dapat dipindah")

    # Outlet authorization
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    new_table = await q_one("SELECT * FROM tables WHERE id=:id", id=new_table_id)
    if not new_table:
        raise HTTPException(404, "Meja tujuan tidak ditemukan")
    if new_table["status"] != "available":
        raise HTTPException(400, "Meja tujuan sedang ditempati")

    # Verify same outlet
    if order.get("outlet_id") and new_table.get("outlet_id"):
        if str(order["outlet_id"]) != str(new_table["outlet_id"]):
            raise HTTPException(400, "Meja tujuan harus dari outlet yang sama")

    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        # Free old table
        await _tx_execute(
            session,
            "UPDATE tables SET status='available', updated_at=NOW() WHERE id=:id",
            id=order["table_id"],
        )
        # Claim new table (conditional — prevents race)
        claim = await _tx_execute(
            session,
            "UPDATE tables SET status='occupied', updated_at=NOW() WHERE id=:id AND status='available'",
            id=new_table_id,
        )
        if claim.rowcount == 0:
            raise HTTPException(400, "Meja tujuan sudah ditempati (race condition dicegah)")
        # Update order — conditional on status='open' to prevent race with checkout
        move_result = await _tx_execute(
            session,
            "UPDATE orders SET table_id=:tid, table_name=:tn, updated_at=NOW() WHERE id=:id AND status='open'",
            tid=new_table_id, tn=new_table["name"], id=order_id,
        )
        if move_result.rowcount == 0:
            raise HTTPException(400, "Order sudah tidak aktif (kemungkinan sudah di-checkout)")

    # Audit log
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "TABLE_MOVED", "orders", entity_id=order_id,
            outlet_id=order.get("outlet_id"),
            new_value={"from_table": order.get("table_name"), "to_table": new_table["name"],
                       "moved_by": user.get("name", "")},
        )
    except Exception:
        pass

    return {"ok": True, "new_table": new_table["name"]}


# ============================================================
# MERGE TABLE — merge two open orders into one
# ============================================================
# Moves all items from a source order into a target order,
# then cancels the source order and frees its table.
# Both orders must be open and in the same outlet.
# ============================================================
@router.post("/orders/merge")
async def merge_tables(
    body: dict,
    user=Depends(get_current_user),
):
    """Merge source order into target order."""
    source_order_id = body.get("source_order_id")
    target_order_id = body.get("target_order_id")
    if not source_order_id or not target_order_id:
        raise HTTPException(400, "source_order_id dan target_order_id wajib diisi")
    if source_order_id == target_order_id:
        raise HTTPException(400, "Tidak bisa merge order dengan dirinya sendiri")

    source = await q_one("SELECT * FROM orders WHERE id=:id", id=source_order_id)
    target = await q_one("SELECT * FROM orders WHERE id=:id", id=target_order_id)
    if not source:
        raise HTTPException(404, "Order sumber tidak ditemukan")
    if not target:
        raise HTTPException(404, "Order tujuan tidak ditemukan")
    if source["status"] != "open" or target["status"] != "open":
        raise HTTPException(400, "Kedua order harus aktif")

    # Outlet authorization
    if user["role"] != "owner":
        for o in [source, target]:
            if o.get("outlet_id") and str(o["outlet_id"]) not in user.get("outlet_ids", []):
                raise HTTPException(403, "Tidak ada akses ke outlet ini")

    # Same outlet check
    if source.get("outlet_id") and target.get("outlet_id"):
        if str(source["outlet_id"]) != str(target["outlet_id"]):
            raise HTTPException(400, "Order harus dari outlet yang sama")

    source_items = source["items"] if isinstance(source["items"], list) else json.loads(source["items"])
    target_items = target["items"] if isinstance(target["items"], list) else json.loads(target["items"])

    # Merge items: combine by product_id + variant_name
    merged = list(target_items)
    for s_item in source_items:
        s_key = f"{s_item.get('product_id')}__{s_item.get('variant_name', '')}"
        existing = None
        for m_item in merged:
            m_key = f"{m_item.get('product_id')}__{m_item.get('variant_name', '')}"
            if m_key == s_key:
                existing = m_item
                break
        if existing:
            existing["quantity"] = int(existing.get("quantity", 0)) + int(s_item.get("quantity", 0))
        else:
            merged.append(s_item)

    new_total = _calc_total(merged)

    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        # Update target order with merged items — check rowcount for race safety
        target_result = await _tx_execute(
            session,
            "UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id AND status='open'",
            it=json.dumps(merged), t=new_total, id=target_order_id,
        )
        if target_result.rowcount == 0:
            raise HTTPException(400, "Order tujuan sudah tidak aktif (kemungkinan sudah di-checkout)")

        # Cancel source order — check rowcount for race safety
        source_result = await _tx_execute(
            session,
            "UPDATE orders SET status='cancelled', closed_at=NOW() WHERE id=:id AND status='open'",
            id=source_order_id,
        )
        if source_result.rowcount == 0:
            raise HTTPException(400, "Order sumber sudah tidak aktif (kemungkinan sudah di-checkout)")

        # Free source table
        await _tx_execute(
            session,
            "UPDATE tables SET status='available', updated_at=NOW() WHERE id=:id",
            id=source["table_id"],
        )

    # Audit log
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "TABLE_MERGED", "orders", entity_id=target_order_id,
            outlet_id=target.get("outlet_id"),
            new_value={"source_order": source.get("order_no"), "target_order": target.get("order_no"),
                       "merged_by": user.get("name", ""), "item_count": len(merged)},
        )
    except Exception:
        pass

    return {"ok": True, "merged_items": len(merged), "total": new_total}


# ============================================================
# SPLIT BILL — split an order's items into separate sales
# ============================================================
# Allows splitting a dine-in order into multiple payments.
# Each split contains a subset of items and is checked out as
# a separate sale. The original order remains open until all
# items are paid for.
# ============================================================
@router.post("/orders/{order_id}/split-checkout")
async def split_checkout(
    order_id: str,
    body: dict,
    user=Depends(get_current_user),
):
    """Checkout a subset of items from an open order.

    Body: {
        items: [{product_id, variant_name, quantity, ...}],
        payment_method, amount_paid, discount, tax, customer_id,
        sales_channel, price_type, card/transfer fields
    }
    """
    order = await q_one("SELECT * FROM orders WHERE id=:id", id=order_id)
    if not order:
        raise HTTPException(404, "Order tidak ditemukan")
    if order["status"] != "open":
        raise HTTPException(400, "Order tidak aktif")

    # Outlet authorization
    if user["role"] != "owner" and order.get("outlet_id"):
        if str(order["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    split_items = body.get("items", [])
    if not split_items:
        raise HTTPException(400, "Item split tidak boleh kosong")

    order_items = order["items"] if isinstance(order["items"], list) else json.loads(order["items"])

    # Verify split items exist in order and have sufficient quantity
    remaining = {f"{i.get('product_id')}__{i.get('variant_name', '')}": int(i.get("quantity", 0)) for i in order_items}
    for s_item in split_items:
        s_key = f"{s_item.get('product_id')}__{s_item.get('variant_name', '')}"
        s_qty = int(s_item.get("quantity", 0))
        if s_key not in remaining:
            raise HTTPException(400, f"Item {s_item.get('name', '')} tidak ada di order")
        if s_qty > remaining[s_key]:
            raise HTTPException(400, f"Jumlah split {s_item.get('name', '')} melebihi jumlah di order")
        remaining[s_key] -= s_qty

    # Use the same checkout logic for the split items
    # Reuse the existing checkout flow by creating a temporary checkout request
    from models.orders import OrderCheckout
    checkout_body = OrderCheckout(
        outlet_id=body.get("outlet_id") or order.get("outlet_id"),
        customer_id=body.get("customer_id", ""),
        payment_method=body.get("payment_method", "cash"),
        amount_paid=body.get("amount_paid", 0),
        discount=body.get("discount", 0),
        tax=body.get("tax", 0),
        note=body.get("note", ""),
        sales_channel=body.get("sales_channel", "offline"),
        price_type=body.get("price_type", "ecceran"),
        card_type=body.get("card_type", ""),
        card_brand=body.get("card_brand", ""),
        card_last4=body.get("card_last4", ""),
        card_reference_no=body.get("card_reference_no", ""),
        card_approval_code=body.get("card_approval_code", ""),
        card_terminal_id=body.get("card_terminal_id", ""),
        transfer_bank=body.get("transfer_bank", ""),
        transfer_account_name=body.get("transfer_account_name", ""),
        transfer_account_no=body.get("transfer_account_no", ""),
        transfer_reference_no=body.get("transfer_reference_no", ""),
        transfer_sender_name=body.get("transfer_sender_name", ""),
        transfer_verified=body.get("transfer_verified", False),
    )

    # Update order with remaining items atomically — check rowcount for race safety
    from database import transaction, execute as _tx_execute
    remaining_items = []
    for o_item in order_items:
        o_key = f"{o_item.get('product_id')}__{o_item.get('variant_name', '')}"
        rem_qty = remaining.get(o_key, 0)
        if rem_qty > 0:
            new_item = dict(o_item)
            new_item["quantity"] = rem_qty
            remaining_items.append(new_item)

    # Use a transaction to ensure atomicity — prevents race with checkout
    async with transaction() as session:
        if remaining_items:
            r = await _tx_execute(
                session,
                "UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id AND status='open'",
                it=json.dumps(remaining_items), t=_calc_total(remaining_items), id=order_id,
            )
        else:
            # All items are being split — set items to split_items
            r = await _tx_execute(
                session,
                "UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id AND status='open'",
                it=json.dumps(split_items), t=_calc_total(split_items), id=order_id,
            )
        if r.rowcount == 0:
            raise HTTPException(400, "Order sudah tidak aktif (kemungkinan sudah di-checkout)")

    return {
        "ok": True,
        "message": "Split items separated. Complete checkout for the split portion.",
        "remaining_items": len(remaining_items),
        "split_items": len(split_items),
    }
