-- Migration: remove FK from idempotency_keys.sale_id so the idempotency
-- claim can be inserted before the sale row inside the same transaction.
-- Integrity is enforced by the transaction (both insert/rollback together).

ALTER TABLE idempotency_keys
DROP CONSTRAINT IF EXISTS idempotency_keys_sale_id_fkey;
