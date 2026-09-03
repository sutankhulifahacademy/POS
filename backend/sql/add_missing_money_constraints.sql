-- Migration: add missing non-negative CHECK constraints for monetary columns.
-- Only columns where negative values are not semantically valid are constrained.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_cash_sales_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_cash_sales_check CHECK (cash_sales >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_non_cash_sales_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_non_cash_sales_check CHECK (non_cash_sales >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_expected_cash_check') THEN
        ALTER TABLE shifts ADD CONSTRAINT shifts_expected_cash_check CHECK (expected_cash >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_total_spent_check') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_total_spent_check CHECK (total_spent >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_memberships_total_spent_check') THEN
        ALTER TABLE customer_memberships ADD CONSTRAINT customer_memberships_total_spent_check CHECK (total_spent >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_discount_value_check') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_discount_value_check CHECK (discount_value >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coupons_min_purchase_check') THEN
        ALTER TABLE coupons ADD CONSTRAINT coupons_min_purchase_check CHECK (min_purchase >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_base_salary_check') THEN
        ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_base_salary_check CHECK (base_salary >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_overtime_pay_check') THEN
        ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_overtime_pay_check CHECK (overtime_pay >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_attendance_bonus_check') THEN
        ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_attendance_bonus_check CHECK (attendance_bonus >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_deductions_check') THEN
        ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_deductions_check CHECK (deductions >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_items_net_pay_check') THEN
        ALTER TABLE payroll_items ADD CONSTRAINT payroll_items_net_pay_check CHECK (net_pay >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_orders_gross_sales_check') THEN
        ALTER TABLE online_orders ADD CONSTRAINT online_orders_gross_sales_check CHECK (gross_sales >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_orders_total_deduction_check') THEN
        ALTER TABLE online_orders ADD CONSTRAINT online_orders_total_deduction_check CHECK (total_deduction >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_orders_expected_settlement_check') THEN
        ALTER TABLE online_orders ADD CONSTRAINT online_orders_expected_settlement_check CHECK (expected_settlement >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_orders_total_cogs_check') THEN
        ALTER TABLE online_orders ADD CONSTRAINT online_orders_total_cogs_check CHECK (total_cogs >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_order_items_online_price_check') THEN
        ALTER TABLE online_order_items ADD CONSTRAINT online_order_items_online_price_check CHECK (online_price >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_order_items_cost_check') THEN
        ALTER TABLE online_order_items ADD CONSTRAINT online_order_items_cost_check CHECK (cost >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_order_items_gross_sales_check') THEN
        ALTER TABLE online_order_items ADD CONSTRAINT online_order_items_gross_sales_check CHECK (gross_sales >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'online_order_items_cogs_check') THEN
        ALTER TABLE online_order_items ADD CONSTRAINT online_order_items_cogs_check CHECK (cogs >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total >= 0);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qris_orders_amount_check') THEN
        ALTER TABLE qris_orders ADD CONSTRAINT qris_orders_amount_check CHECK (amount >= 0);
    END IF;
END $$;
