-- Migration: extend qris_orders to store the canonical transaction snapshot.
-- This allows the sale finalization to use the same backend-calculated amount
-- as the QRIS charge, preventing frontend amount divergence.

ALTER TABLE qris_orders
ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS items JSONB,
ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS outlet_id UUID,
ADD COLUMN IF NOT EXISTS price_type VARCHAR(10) DEFAULT 'ecceran';

CREATE INDEX IF NOT EXISTS idx_qris_orders_sale_id ON qris_orders(sale_id);
CREATE INDEX IF NOT EXISTS idx_qris_orders_order_id ON qris_orders(order_id);
