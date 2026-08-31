-- Transfer Stok with Pending Task & Item-Level Approval
-- Run this migration to add transfer_items table and new columns

-- Add new columns to stock_transfers
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Create transfer_items table for item-level approval
CREATE TABLE IF NOT EXISTS transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    qty_sent INT NOT NULL DEFAULT 0,
    qty_received INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, checked, approved, rejected
    note TEXT DEFAULT '',
    checked_by UUID,
    checked_by_name VARCHAR(255),
    checked_at TIMESTAMPTZ,
    approved_by UUID,
    approved_by_name VARCHAR(255),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer_id ON transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status);
