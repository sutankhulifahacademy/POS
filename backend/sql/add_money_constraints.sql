-- Safe migration: Add CHECK constraints for money and quantity columns.
-- These constraints enforce data integrity at the database level.
-- All constraints use IF NOT EXISTS pattern via DO blocks to be idempotent.

-- ============================================================
-- PRODUCTS: price >= 0, cost >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_price_check CHECK (price >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_cost_check CHECK (cost >= 0);
    END IF;
END $$;

-- ============================================================
-- SALES: subtotal >= 0, discount >= 0, tax >= 0, total >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_subtotal_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_subtotal_check CHECK (subtotal >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_discount_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_discount_check CHECK (discount >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_tax_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_tax_check CHECK (tax >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_total_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_total_check CHECK (total >= 0);
    END IF;
END $$;

-- ============================================================
-- SALES: amount_paid >= 0, change_amount >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_amount_paid_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_amount_paid_check CHECK (amount_paid >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_change_amount_check') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_change_amount_check CHECK (change_amount >= 0);
    END IF;
END $$;

-- ============================================================
-- SHIFTS: opening_cash >= 0, actual_cash >= 0, cash_sales >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_opening_cash_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_opening_cash_check CHECK (opening_cash >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_actual_cash_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_actual_cash_check CHECK (actual_cash >= 0);
    END IF;
END $$;

-- ============================================================
-- EXPENSES: amount >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_check') THEN
        ALTER TABLE expenses ADD CONSTRAINT expenses_amount_check CHECK (amount >= 0);
    END IF;
END $$;

-- ============================================================
-- PURCHASE_ORDERS: total >= 0
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_total_check') THEN
        ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_total_check CHECK (total >= 0);
    END IF;
END $$;
