-- Migration: add idempotency key column to qris_orders to prevent
-- duplicate Midtrans charges for the same logical payment request.

ALTER TABLE qris_orders
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_qris_orders_idempotency_key ON qris_orders(idempotency_key);
