"""Sales service — transaction validation, payment helpers, stock deduction."""
import json

from fastapi import HTTPException
from pydantic import BaseModel

from database import (
    q_one,
    q_all,
    q_exec,
    transaction,
    execute,
    session_one,
)
from utils import new_id, clean, clean_list, _u
from services.inventory_service import _get_main_outlet_id
from services.pricing_service import resolve_product_price
from services.money import money, ZERO


def _validate_sale_total(subtotal, discount, tax):
    """
    Hitung total transaksi dengan aman.
    - Discount tidak boleh negatif atau melebihi subtotal.
    - Tax tidak boleh negatif.
    - Total tidak boleh negatif.
    - Semua nilai uang dihitung dengan Decimal dan ROUND_HALF_UP.
    """
    subtotal = money(subtotal)
    discount = money(discount)
    tax = money(tax)

    if discount < ZERO:
        raise HTTPException(400, "Discount tidak boleh negatif")
    if tax < ZERO:
        raise HTTPException(400, "Tax tidak boleh negatif")
    if discount > subtotal:
        raise HTTPException(400, "Discount tidak boleh melebihi subtotal")
    if tax > subtotal:
        raise HTTPException(400, "Tax tidak boleh melebihi subtotal")

    total = subtotal - discount + tax
    if total < ZERO:
        total = ZERO
    return money(total)


def _validate_payment(
    payment_method: str,
    total: float,
    amount_paid: float,
    body,
):
    """
    Validasi semua metode pembayaran.

    Return:
        amount_paid
        change_amount
    """

    if payment_method not in {
        "cash",
        "card",
        "qris",
        "transfer"
    }:
        raise HTTPException(
            400,
            "Metode pembayaran tidak valid"
        )

    # =========================================================
    # CASH
    # =========================================================

    if payment_method == "cash":

        paid = money(amount_paid)
        if paid < total:
            raise HTTPException(
                400,
                "Uang bayar kurang"
            )

        change = paid - total
        if change < ZERO:
            change = ZERO
        return paid, money(change)

    # =========================================================
    # CARD
    # =========================================================

    if payment_method == "card":

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

        card_last4 = str(body.card_last4)

        if len(card_last4) != 4:
            raise HTTPException(
                400,
                "4 digit terakhir kartu harus tepat 4 digit"
            )

        if not card_last4.isdigit():
            raise HTTPException(
                400,
                "4 digit terakhir kartu harus berupa angka"
            )

        if not body.card_reference_no:
            raise HTTPException(
                400,
                "No. referensi kartu wajib diisi"
            )

        return total, ZERO

    # =========================================================
    # QRIS
    # =========================================================

    if payment_method == "qris":

        return total, ZERO

    # =========================================================
    # TRANSFER
    # =========================================================

    if payment_method == "transfer":

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

        # Transfer dianggap masuk sesuai nominal transaksi.
        # Verifikasi tidak boleh dipaksa dari frontend.
        return total, ZERO

    raise HTTPException(
        400,
        "Metode pembayaran tidak valid"
    )


def _build_payment_values(body, transfer_reference_no=None):
    """
    Menyiapkan field payment untuk tabel sales.
    Field yang tidak relevan dibuat NULL.
    """

    payment_method = body.payment_method

    return {
        "ct": (
            _u(body.card_type)
            if payment_method == "card"
            else None
        ),

        "cb": (
            _u(body.card_brand)
            if payment_method == "card"
            else None
        ),

        "cl4": (
            _u(body.card_last4)
            if payment_method == "card"
            else None
        ),

        "cr": (
            _u(body.card_reference_no)
            if payment_method == "card"
            else None
        ),

        "ca": (
            _u(body.card_approval_code)
            if payment_method == "card"
            else None
        ),

        "terminal": (
            _u(body.card_terminal_id)
            if payment_method == "card"
            else None
        ),

        "tb": (
            _u(body.transfer_bank)
            if payment_method == "transfer"
            else None
        ),

        "tan": (
            _u(body.transfer_account_name)
            if payment_method == "transfer"
            else None
        ),

        "ta": (
            _u(body.transfer_account_no)
            if payment_method == "transfer"
            else None
        ),

        "tr": (
            transfer_reference_no
            if payment_method == "transfer"
            else None
        ),

        "tsn": (
            _u(body.transfer_sender_name)
            if payment_method == "transfer"
            else None
        ),

        # Jangan menerima status verified dari frontend.
        "tv": False,

        "payment_ref": (
            transfer_reference_no
            if payment_method == "transfer"
            else (
                _u(body.card_reference_no)
                if payment_method == "card"
                else None
            )
        ),
    }


async def _validate_and_get_sale_items(items, sales_channel="offline", price_type="ecceran"):
    """
    Validasi item transaksi dan stok.

    Price resolution dilakukan di BACKEND menggunakan pricing_service.
    Frontend price hanya digunakan sebagai fallback jika product tidak
    memiliki additional pricing.

    Return:
        list item yang sudah dinormalisasi
        subtotal
    """

    if not items:
        raise HTTPException(
            400,
            "Cart is empty"
        )

    normalized_items = []
    subtotal = ZERO

    for item in items:

        if isinstance(item, BaseModel):
            data = item.model_dump()
        else:
            data = dict(item)

        product_id = str(
            data.get("product_id") or ""
        )

        if not product_id:
            raise HTTPException(
                400,
                "Product ID tidak valid"
            )

        quantity = int(
            data.get("quantity") or 0
        )

        if quantity <= 0:
            raise HTTPException(
                400,
                "Quantity harus lebih besar dari 0"
            )

        product = await q_one(
            """
            SELECT
                id,
                name,
                stock,
                price,
                cost,
                variants,
                retail_price,
                reseller_price,
                wholesale_price,
                online_price
            FROM products
            WHERE id=:id
            """,
            id=product_id
        )

        if not product:
            raise HTTPException(
                400,
                f"Product {data.get('name', product_id)} not found"
            )

        if int(product["stock"]) < quantity:
            raise HTTPException(
                400,
                f"Insufficient stock for {product['name']}"
            )

        # =====================================================
        # BACKEND PRICE RESOLUTION
        # =====================================================
        # Parse variants JSONB for price resolution
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

        variant_name = data.get("variant_name") or ""

        resolved_price = await resolve_product_price(
            product_for_pricing,
            variant_name=variant_name,
            sales_channel=sales_channel,
            price_type=price_type,
        )
        resolved_price = money(resolved_price)

        # Persist historical cost snapshot for this sale item
        item_cost = money(product.get("cost") or 0)

        # Gunakan nama dari product jika frontend kosong.
        name = (
            data.get("name")
            or product["name"]
        )

        data["product_id"] = product_id
        data["name"] = name
        data["price"] = float(resolved_price)
        data["cost"] = float(item_cost)
        data["quantity"] = quantity
        data["variant_name"] = variant_name
        data["price_type"] = price_type
        data["sales_channel"] = sales_channel

        subtotal += resolved_price * quantity

        normalized_items.append(data)

    return normalized_items, money(subtotal)


async def _deduct_sale_stock(
    session,
    items,
    invoice_no,
    outlet_id,
    user_id
):
    """
    Kurangi stock global + outlet stock + buat stock movement.

    Semua operasi menggunakan session yang sama agar menjadi
    bagian dari transaction sales.
    """

    for item in items:

        product_id = item["product_id"]
        quantity = int(item["quantity"])

        if quantity <= 0:
            raise HTTPException(
                400,
                "Quantity harus lebih besar dari 0"
            )

        # =====================================================
        # GLOBAL STOCK
        # =====================================================

        result = await execute(
            session,
            """
            UPDATE products
            SET
                stock = stock - :q,
                updated_at = NOW()
            WHERE id = :id
              AND stock >= :q
            """,
            q=quantity,
            id=product_id
        )

        if result.rowcount == 0:
            raise HTTPException(
                400,
                f"Stok tidak cukup untuk {item['name']}"
            )

        # =====================================================
        # OUTLET STOCK
        # =====================================================

        if outlet_id:

            outlet_stock = await session_one(
                session,
                """
                SELECT
                    id,
                    quantity
                FROM outlet_stocks
                WHERE product_id = :p
                  AND outlet_id = :o
                FOR UPDATE
                """,
                p=product_id,
                o=outlet_id
            )

            if not outlet_stock:

                # -------------------------------------------------
                # Jika outlet stock belum ada:
                #
                # Hanya main outlet yang boleh diinisialisasi.
                #
                # products.stock SUDAH dikurangi di atas.
                # Jadi JANGAN melakukan:
                #
                #     base + (-quantity)
                #
                # karena itu menyebabkan double deduction.
                # -------------------------------------------------

                main_outlet_id = await _get_main_outlet_id()

                if str(outlet_id) != str(main_outlet_id):
                    raise HTTPException(
                        400,
                        f"Stok outlet untuk {item['name']} belum tersedia"
                    )

                # Ambil stock global setelah deduction.
                current_product = await session_one(
                    session,
                    """
                    SELECT stock
                    FROM products
                    WHERE id = :id
                    FOR UPDATE
                    """,
                    id=product_id
                )

                if not current_product:
                    raise HTTPException(
                        400,
                        f"Product {item['name']} not found"
                    )

                outlet_quantity = int(
                    current_product["stock"]
                )

                await execute(
                    session,
                    """
                    INSERT INTO outlet_stocks (
                        product_id,
                        outlet_id,
                        quantity,
                        updated_at
                    )
                    VALUES (
                        :p,
                        :o,
                        :q,
                        NOW()
                    )
                    """,
                    p=product_id,
                    o=outlet_id,
                    q=outlet_quantity
                )

            else:

                # -------------------------------------------------
                # Outlet stock harus cukup.
                # -------------------------------------------------

                current_quantity = int(
                    outlet_stock["quantity"] or 0
                )

                if current_quantity < quantity:
                    raise HTTPException(
                        400,
                        f"Stok outlet tidak cukup untuk {item['name']}"
                    )

                await execute(
                    session,
                    """
                    UPDATE outlet_stocks
                    SET
                        quantity = quantity - :q,
                        updated_at = NOW()
                    WHERE id = :id
                      AND quantity >= :q
                    """,
                    q=quantity,
                    id=outlet_stock["id"]
                )

        # =====================================================
        # STOCK MOVEMENT
        # =====================================================

        await execute(
            session,
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
            pid=product_id,
            pn=item["name"],
            d=-quantity,
            note=f"Sale {invoice_no}",
            oid=_u(outlet_id),
            u=user_id
        )


async def _insert_sale(
    session,
    *,
    sale_id,
    invoice_no,
    shift_id,
    outlet_id,
    customer_id,
    user,
    items,
    subtotal,
    discount,
    tax,
    total,
    payment_method,
    amount_paid,
    change_amount,
    body,
    source="pos",
    table_id=None,
    table_name=None,
    transfer_reference_no=None,
    sales_channel="offline",
    price_type="ecceran",
):
    """
    Insert transaksi sales menggunakan session transaction.

    Tidak melakukan commit sendiri.
    """

    payment_values = _build_payment_values(
        body,
        transfer_reference_no
    )

    await execute(
        session,
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

            card_type,
            card_brand,
            card_last4,
            card_reference_no,
            card_approval_code,
            card_terminal_id,

            transfer_bank,
            transfer_account_name,
            transfer_account_no,
            transfer_reference_no,
            transfer_sender_name,
            transfer_verified,

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

            :ct,
            :cb,
            :cl4,
            :cr,
            :ca,
            :terminal,

            :tb,
            :tan,
            :ta,
            :tr,
            :tsn,
            :tv,

            :payment_ref,

            :source,
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
        cid=_u(customer_id),

        ci=user["id"],
        cn=user.get("name", ""),

        it=json.dumps(items),

        sub=subtotal,
        disc=discount,
        tax=tax,
        tot=total,

        pm=payment_method,
        paid=amount_paid,
        chg=change_amount,

        ct=payment_values["ct"],
        cb=payment_values["cb"],
        cl4=payment_values["cl4"],
        cr=payment_values["cr"],
        ca=payment_values["ca"],
        terminal=payment_values["terminal"],

        tb=payment_values["tb"],
        tan=payment_values["tan"],
        ta=payment_values["ta"],
        tr=payment_values["tr"],
        tsn=payment_values["tsn"],
        tv=payment_values["tv"],

        payment_ref=payment_values["payment_ref"],

        source=source,
        tid=_u(table_id),
        tn=_u(table_name),
        note=_u(getattr(body, "note", None)),
        sc=sales_channel,
        pt=price_type,
    )
