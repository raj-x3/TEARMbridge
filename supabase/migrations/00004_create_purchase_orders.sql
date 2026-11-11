-- 00004_create_purchase_orders.sql
-- Purchase orders and line items.

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  po_number               TEXT NOT NULL,
  buyer_id                UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
  supplier_id             UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  linked_agreement_id     UUID REFERENCES commercial_agreements(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft', 'needs_review', 'counteroffer_sent',
                            'awaiting_counterparty', 'ready_to_invoice',
                            'completed', 'cancelled'
                          )),
  currency                TEXT NOT NULL DEFAULT 'USD',
  subtotal                NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount              NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  shipping_amount         NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0),
  total_amount            NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  requested_delivery_date DATE,
  requested_payment_terms TEXT,
  received_at             TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_workspace ON purchase_orders (workspace_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_buyer ON purchase_orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_agreement ON purchase_orders (linked_agreement_id);

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Purchase Order Line Items
CREATE TABLE IF NOT EXISTS purchase_order_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku               TEXT,
  product_name      TEXT NOT NULL,
  description       TEXT,
  quantity          NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
  unit_price        NUMERIC(15, 2) NOT NULL CHECK (unit_price >= 0),
  line_total        NUMERIC(15, 2) NOT NULL CHECK (line_total >= 0),
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_line_items_order ON purchase_order_line_items (purchase_order_id);
