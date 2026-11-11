-- 00007_create_audit_events.sql
-- Audit trail for all commercial workspace actions.

CREATE TABLE IF NOT EXISTS audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type      TEXT NOT NULL DEFAULT 'user'
                  CHECK (actor_type IN ('user', 'system', 'webhook')),
  entity_type     TEXT NOT NULL
                  CHECK (entity_type IN (
                    'purchase_order', 'agreement', 'counterparty',
                    'document', 'commercial_rule', 'workspace'
                  )),
  entity_id       UUID NOT NULL,
  event_type      TEXT NOT NULL,
  details         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_workspace ON audit_events (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_id);
