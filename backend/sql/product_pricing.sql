-- ============================================================
-- MIGRATION: Product Additional Pricing (Eceran, Reseller, Partai, Online)
-- Non-destructive: adds new columns, does NOT modify existing price field
-- ============================================================

-- ============ ADD PRICING COLUMNS TO products ============
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'standard';
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS reseller_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS online_price NUMERIC(12,2);

-- ============ ADD SALES CHANNEL + PRICE TYPE TO sales ============
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sales_channel VARCHAR(10) DEFAULT 'offline';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_type VARCHAR(10) DEFAULT 'ecceran';

CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(sales_channel);
CREATE INDEX IF NOT EXISTS idx_sales_price_type ON sales(price_type);

-- ============ ADD PERMISSIONS FOR PRODUCT PRICING ============
-- Owner + admin + manager can manage pricing (uses existing products module)
-- No new permission module needed — pricing is part of products.update

-- ============ SEED product_type FOR EXISTING FROZEN PRODUCTS ============
-- Mark products with SKU starting with FRZ as frozen type
UPDATE products SET product_type = 'frozen'
WHERE sku LIKE 'FRZ-%' AND product_type = 'standard';
