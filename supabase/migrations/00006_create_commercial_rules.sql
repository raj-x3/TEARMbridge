-- 00006_create_commercial_rules.sql
-- Commercial rules engine configuration.

CREATE TABLE IF NOT EXISTS commercial_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  rule_type       TEXT NOT NULL DEFAULT 'threshold'
                  CHECK (rule_type IN (
                    'threshold', 'payment_terms', 'fulfillment',
                    'gate', 'penalty', 'discount', 'general'
                  )),
  configuration   JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority        INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_rules_workspace ON commercial_rules (workspace_id);
CREATE INDEX IF NOT EXISTS idx_commercial_rules_active ON commercial_rules (workspace_id, is_active) WHERE is_active = true;

CREATE TRIGGER trg_commercial_rules_updated_at
  BEFORE UPDATE ON commercial_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
