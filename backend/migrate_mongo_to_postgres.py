"""
Migrasi data MongoDB → PostgreSQL untuk Sutan Khulifah POS.

Prasyarat:
    pip install asyncpg motor pymongo python-dotenv

Cara pakai:
    1. Pastikan PostgreSQL sudah jalan dan schema sudah di-load:
       psql -U posuser -d sutankhulifah_pos -f postgres_schema.sql
    2. Set environment variables MONGO_URL, MONGO_DB, POSTGRES_URL (lihat .env.example)
    3. Jalankan:
       python migrate_mongo_to_postgres.py

Script ini idempotent — bisa dijalankan berulang tanpa duplikasi (pakai UPSERT).
"""
import os
import json
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import asyncpg

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("DB_NAME", "test_database")
POSTGRES_URL = os.environ.get("POSTGRES_URL", "postgresql://posuser:pospass@localhost:5432/sutankhulifah_pos")


def _dt(v):
    """Convert ISO string / datetime to datetime object or None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _uuid_or_none(v):
    """Return valid UUID string or None."""
    if not v or v == "":
        return None
    return str(v)


async def migrate():
    mongo = AsyncIOMotorClient(MONGO_URL)
    mdb = mongo[MONGO_DB]
    pg = await asyncpg.connect(POSTGRES_URL)
    print(f"✓ Connected: MongoDB={MONGO_DB} → PostgreSQL")

    async def bulk(name, mongo_col, sql_insert, mapper):
        docs = await mdb[mongo_col].find({}, {"_id": 0}).to_list(100000)
        if not docs:
            print(f"  {name}: 0 documents (skipped)")
            return
        count = 0
        for d in docs:
            try:
                await pg.execute(sql_insert, *mapper(d))
                count += 1
            except Exception as e:
                print(f"  ⚠️  {name} error on {d.get('id', '?')}: {e}")
        print(f"  {name}: {count}/{len(docs)} migrated")

    # 1. USERS
    await bulk("users", "users",
        """INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, password_hash=EXCLUDED.password_hash""",
        lambda d: (d["id"], d["email"], d["name"], d["role"], d["password_hash"],
                   d.get("is_active", True), _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 2. BUSINESS
    await bulk("business", "business",
        """INSERT INTO business (id, name, business_type, currency, tax_rate, address, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d["business_type"], d.get("currency", "IDR"),
                   d.get("tax_rate", 0), d.get("address", ""), _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 3. OUTLETS
    await bulk("outlets", "outlets",
        """INSERT INTO outlets (id, name, address, phone, is_main, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d.get("address", ""), d.get("phone", ""),
                   d.get("is_main", False), _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 4. CATEGORIES
    await bulk("categories", "categories",
        """INSERT INTO categories (id, name, color, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d.get("color", "#D4AF37"),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 5. PRODUCTS
    await bulk("products", "products",
        """INSERT INTO products (id, name, sku, barcode, category_id, price, cost, stock, low_stock_threshold,
                                 unit, image_url, description, is_active, variants, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
           ON CONFLICT (sku) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, stock=EXCLUDED.stock""",
        lambda d: (d["id"], d["name"], d["sku"], d.get("barcode", ""),
                   _uuid_or_none(d.get("category_id")), d["price"], d.get("cost", 0),
                   d.get("stock", 0), d.get("low_stock_threshold", 5), d.get("unit", "pcs"),
                   d.get("image_url", ""), d.get("description", ""), d.get("is_active", True),
                   json.dumps(d.get("variants", [])),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 6. OUTLET STOCKS
    await bulk("outlet_stocks", "outlet_stocks",
        """INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity""",
        lambda d: (d["product_id"], d["outlet_id"], d.get("quantity", 0), _dt(d.get("updated_at"))))

    # 7. STOCK MOVEMENTS
    await bulk("stock_movements", "stock_movements",
        """INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["product_id"], d.get("product_name", ""), d["delta"],
                   d["reason"], d.get("note", ""), _uuid_or_none(d.get("outlet_id")),
                   _uuid_or_none(d.get("user_id")), _dt(d.get("created_at"))))

    # 8. CUSTOMERS
    await bulk("customers", "customers",
        """INSERT INTO customers (id, name, phone, email, address, loyalty_points, total_spent, visit_count, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d.get("phone", ""), d.get("email", ""), d.get("address", ""),
                   d.get("loyalty_points", 0), d.get("total_spent", 0), d.get("visit_count", 0),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 9. SUPPLIERS
    await bulk("suppliers", "suppliers",
        """INSERT INTO suppliers (id, name, contact_person, phone, email, address, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d.get("contact_person", ""), d.get("phone", ""),
                   d.get("email", ""), d.get("address", ""),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 10. SALES
    await bulk("sales", "sales",
        """INSERT INTO sales (id, invoice_no, shift_id, outlet_id, customer_id, cashier_id, cashier_name, items,
                              subtotal, discount, tax, total, payment_method, amount_paid, change_amount,
                              source, table_id, table_name, note, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (invoice_no) DO NOTHING""",
        lambda d: (d["id"], d["invoice_no"], _uuid_or_none(d.get("shift_id")),
                   _uuid_or_none(d.get("outlet_id")), _uuid_or_none(d.get("customer_id")),
                   _uuid_or_none(d.get("cashier_id")), d.get("cashier_name", ""),
                   json.dumps(d["items"]), d["subtotal"], d.get("discount", 0),
                   d.get("tax", 0), d["total"], d["payment_method"], d.get("amount_paid", 0),
                   d.get("change", 0), d.get("source", "pos"),
                   _uuid_or_none(d.get("table_id")), d.get("table_name", ""),
                   d.get("note", ""), _dt(d.get("created_at"))))

    # 11. SHIFTS
    await bulk("shifts", "shifts",
        """INSERT INTO shifts (id, cashier_id, cashier_name, outlet_id, opening_cash, status, opened_at, closed_at,
                                actual_cash, expected_cash, difference, cash_sales, non_cash_sales,
                                transaction_count, note, close_note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["cashier_id"], d.get("cashier_name", ""),
                   _uuid_or_none(d.get("outlet_id")), d.get("opening_cash", 0), d["status"],
                   _dt(d.get("opened_at")), _dt(d.get("closed_at")),
                   d.get("actual_cash"), d.get("expected_cash"), d.get("difference"),
                   d.get("cash_sales", 0), d.get("non_cash_sales", 0),
                   d.get("transaction_count", 0), d.get("note", ""), d.get("close_note", "")))

    # 12. PURCHASE ORDERS
    await bulk("purchase_orders", "purchase_orders",
        """INSERT INTO purchase_orders (id, po_no, supplier_id, supplier_name, items, total, status, note,
                                         created_by, created_at, received_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) ON CONFLICT (po_no) DO NOTHING""",
        lambda d: (d["id"], d["po_no"], _uuid_or_none(d.get("supplier_id")), d.get("supplier_name", ""),
                   json.dumps(d["items"]), d.get("total", 0), d.get("status", "draft"),
                   d.get("note", ""), _uuid_or_none(d.get("created_by")),
                   _dt(d.get("created_at")), _dt(d.get("received_at"))))

    # 13. STOCK TRANSFERS
    await bulk("stock_transfers", "stock_transfers",
        """INSERT INTO stock_transfers (id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name,
                                          to_outlet_name, items, total_quantity, note, status,
                                          created_by, created_by_name, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13) ON CONFLICT (transfer_no) DO NOTHING""",
        lambda d: (d["id"], d["transfer_no"], _uuid_or_none(d.get("from_outlet_id")),
                   _uuid_or_none(d.get("to_outlet_id")), d.get("from_outlet_name", ""),
                   d.get("to_outlet_name", ""), json.dumps(d["items"]), d.get("total_quantity", 0),
                   d.get("note", ""), d.get("status", "completed"),
                   _uuid_or_none(d.get("created_by")), d.get("created_by_name", ""),
                   _dt(d.get("created_at"))))

    # 14. TABLES
    await bulk("tables", "tables",
        """INSERT INTO tables (id, name, capacity, outlet_id, zone, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["name"], d.get("capacity", 2), _uuid_or_none(d.get("outlet_id")),
                   d.get("zone", "Utama"), d.get("status", "available"),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    # 15. ORDERS
    await bulk("orders", "orders",
        """INSERT INTO orders (id, order_no, table_id, table_name, outlet_id, guest_count, items, total,
                                status, cashier_id, cashier_name, sale_id, opened_at, closed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING""",
        lambda d: (d["id"], d["order_no"], _uuid_or_none(d.get("table_id")), d.get("table_name", ""),
                   _uuid_or_none(d.get("outlet_id")), d.get("guest_count", 1),
                   json.dumps(d.get("items", [])), d.get("total", 0), d["status"],
                   _uuid_or_none(d.get("cashier_id")), d.get("cashier_name", ""),
                   _uuid_or_none(d.get("sale_id")),
                   _dt(d.get("opened_at")), _dt(d.get("closed_at"))))

    # 16. QRIS ORDERS
    await bulk("qris_orders", "qris_orders",
        """INSERT INTO qris_orders (order_id, amount, description, transaction_id, status, fraud_status,
                                     qr_string, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (order_id) DO NOTHING""",
        lambda d: (d["order_id"], d["amount"], d.get("description", ""), d.get("transaction_id", ""),
                   d.get("status", "pending"), d.get("fraud_status"), d.get("qr_string", ""),
                   _dt(d.get("created_at")), _dt(d.get("updated_at"))))

    await pg.close()
    mongo.close()
    print("\n✅ Migrasi selesai. Verifikasi dengan: psql -c 'SELECT COUNT(*) FROM users;'")


if __name__ == "__main__":
    asyncio.run(migrate())
