-- 00002_create_counterparties.sql
-- Buyers and suppliers directory.

CREATE TABLE IF NOT EXISTS counterparties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  legal_name          TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  entity_type         TEXT NOT NULL DEFAULT 'buyer'
                      CHECK (entity_type IN ('buyer', 'supplier', 'both')),
  email               TEXT,
  phone               TEXT,
  country             TEXT,
  currency            TEXT NOT NULL DEFAULT 'USD',
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'inactive', 'suspended')),
  external_reference  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counterparties_workspace ON counterparties (workspace_id);
CREATE INDEX IF NOT EXISTS idx_counterparties_entity_type ON counterparties (workspace_id, entity_type);

CREATE TRIGGER trg_counterparties_updated_at
  BEFORE UPDATE ON counterparties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
