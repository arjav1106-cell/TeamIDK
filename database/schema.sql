CREATE TABLE IF NOT EXISTS products (
  product_code VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weight NUMERIC(12,3) NOT NULL DEFAULT 0,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('sales', 'purchase')),
  party_name VARCHAR(255) NOT NULL,
  party_contact VARCHAR(255) NOT NULL DEFAULT '',
  products JSONB NOT NULL,
  status VARCHAR(30) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manufacturing_batches (
  batch_number VARCHAR(64) PRIMARY KEY,
  raw_materials JSONB NOT NULL,
  output JSONB NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_type VARCHAR(40) NOT NULL,
  reference_id VARCHAR(100) NOT NULL,
  product_code VARCHAR(64) NOT NULL REFERENCES products(product_code),
  quantity_delta INTEGER NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('sales', 'purchase', 'manufacturing', 'manual', 'import')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_type_created_at ON orders(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_id, source_type);
