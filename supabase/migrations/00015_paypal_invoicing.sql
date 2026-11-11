-- ============================================================================
-- 00015_paypal_invoicing.sql
-- TERMBridge Module 5: Real PayPal Sandbox Invoicing & Payment Lifecycle
--
-- Tables:
--   1. paypal_invoice_records: Local representation of external PayPal invoices
--   2. paypal_webhook_events: Immutable audit log of verified/received webhooks
--   3. paypal_api_operations: Idempotency and safe retry tracking
--
-- Security:
--   - Strict RLS on all tables
--   - Workspace members have SELECT permission only
--   - Direct INSERT/UPDATE/DELETE revoked from all client roles
--   - Mutations executed exclusively by server services using service_role
--   - Audit log integration with immutability guarantees
-- ============================================================================

-- ============================================================================
-- 1. EXTEND AUDIT EVENT CONSTRAINTS
-- ============================================================================

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_entity_type_check;

ALTER TABLE audit_events ADD CONSTRAINT audit_events_entity_type_check
  CHECK (entity_type IN (
    -- original entities
    'purchase_order',
    'agreement',
    'counterparty',
    'document',
    'commercial_rule',
    'workspace',
    -- module 4 additions
    'commercial_decision',
    'counteroffer',
    'counteroffer_version',
    'finalized_transaction',
    -- module 5 additions
    'paypal_invoice',
    'paypal_webhook_event'
  ));

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_event_type;

ALTER TABLE audit_events ADD CONSTRAINT chk_audit_event_type
  CHECK (event_type IN (
    -- original events
    'purchase_order.created',
    'purchase_order.updated',
    'purchase_order.status_changed',
    'agreement.created',
    'agreement.updated',
    'agreement.status_changed',
    'agreement.conflict_resolved',
    'counterparty.created',
    'counterparty.updated',
    'document.uploaded',
    'document.version_added',
    'document.archived',
    'commercial_rule.created',
    'commercial_rule.updated',
    'workspace.updated',
    'workspace.member_added',
    'workspace.member_removed',
    -- module 4 events
    'commercial_decision.evaluated',
    'counteroffer.created',
    'counteroffer.seller_approved',
    'counteroffer.seller_rejected',
    'counteroffer.sent_to_buyer',
    'counteroffer.buyer_accepted',
    'counteroffer.buyer_rejected',
    'counteroffer.changes_requested',
    'counteroffer.withdrawn',
    'counteroffer.expired',
    'counteroffer.superseded',
    'counteroffer_version.created',
    'transaction.finalized',
    -- module 5 events
    'paypal_invoice.draft_created',
    'paypal_invoice.sent',
    'paypal_invoice.updated',
    'paypal_invoice.paid',
    'paypal_invoice.partially_paid',
    'paypal_invoice.cancelled',
    'paypal_invoice.refunded',
    'paypal_webhook.received',
    'paypal_webhook.verified',
    'paypal_webhook.rejected'
  ));

-- ============================================================================
-- 2. TABLE: paypal_invoice_records
-- ============================================================================

CREATE TABLE IF NOT EXISTS paypal_invoice_records (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finalized_transaction_id  UUID           NOT NULL UNIQUE REFERENCES finalized_transactions(id) ON DELETE RESTRICT,
  paypal_invoice_id        TEXT           UNIQUE,
  invoice_number           TEXT,
  paypal_status            TEXT,
  normalized_status        TEXT           NOT NULL DEFAULT 'draft'
                                          CHECK (normalized_status IN (
                                            'draft',
                                            'sent',
                                            'unpaid',
                                            'partially_paid',
                                            'paid',
                                            'marked_as_paid',
                                            'refunded',
                                            'partially_refunded',
                                            'cancelled',
                                            'scheduled',
                                            'unknown'
                                          )),
  currency_code            TEXT           NOT NULL DEFAULT 'USD',
  invoice_amount           NUMERIC(15,2)  NOT NULL CHECK (invoice_amount >= 0),
  amount_paid              NUMERIC(15,2)  NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due               NUMERIC(15,2)  NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  recipient_email          TEXT           NOT NULL,
  recipient_view_url       TEXT,
  currency_snapshot        JSONB,
  create_request_id        UUID           NOT NULL DEFAULT gen_random_uuid(),
  send_request_id          UUID,
  created_by               UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
  draft_created_at         TIMESTAMPTZ,
  sent_at                  TIMESTAMPTZ,
  paid_at                  TIMESTAMPTZ,
  last_synced_at           TIMESTAMPTZ,
  safe_error_code          TEXT
);

CREATE INDEX IF NOT EXISTS idx_paypal_invoice_records_workspace
  ON paypal_invoice_records (workspace_id);
CREATE INDEX IF NOT EXISTS idx_paypal_invoice_records_status
  ON paypal_invoice_records (workspace_id, normalized_status);
CREATE INDEX IF NOT EXISTS idx_paypal_invoice_records_pp_id
  ON paypal_invoice_records (paypal_invoice_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_paypal_invoice_records_updated_at
  BEFORE UPDATE ON paypal_invoice_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. TABLE: paypal_webhook_events
-- ============================================================================

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_event_id     TEXT         UNIQUE NOT NULL,
  event_type          TEXT         NOT NULL,
  paypal_invoice_id   TEXT,
  payload_hash        TEXT         NOT NULL,
  signature_verified  BOOLEAN      NOT NULL DEFAULT false,
  processing_status   TEXT         NOT NULL DEFAULT 'received'
                                   CHECK (processing_status IN (
                                     'received',
                                     'processed',
                                     'ignored',
                                     'failed',
                                     'duplicate'
                                   )),
  received_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ,
  safe_error_code     TEXT,
  raw_summary         JSONB
);

CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_pp_event_id
  ON paypal_webhook_events (paypal_event_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_invoice_id
  ON paypal_webhook_events (paypal_invoice_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_status
  ON paypal_webhook_events (processing_status);

-- ============================================================================
-- 4. TABLE: paypal_api_operations (Idempotency and operation tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS paypal_api_operations (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  transaction_id         UUID         NOT NULL REFERENCES finalized_transactions(id) ON DELETE CASCADE,
  operation_type         TEXT         NOT NULL
                                      CHECK (operation_type IN (
                                        'create_draft',
                                        'send_invoice',
                                        'sync_status',
                                        'verify_webhook'
                                      )),
  request_id             UUID         NOT NULL,
  operation_status       TEXT         NOT NULL DEFAULT 'pending'
                                      CHECK (operation_status IN (
                                        'pending',
                                        'in_progress',
                                        'succeeded',
                                        'failed'
                                      )),
  attempt_count          INT          NOT NULL DEFAULT 1,
  safe_response_metadata JSONB,
  last_attempt_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, operation_type, request_id)
);

CREATE INDEX IF NOT EXISTS idx_paypal_api_ops_tx
  ON paypal_api_operations (transaction_id, operation_type);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE paypal_invoice_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select_paypal_invoices"
  ON paypal_invoice_records FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Revoke direct mutation from client roles
REVOKE INSERT, UPDATE, DELETE ON paypal_invoice_records FROM authenticated, anon, public;

ALTER TABLE paypal_webhook_events ENABLE ROW LEVEL SECURITY;

-- No direct client select on webhook events by default; only service_role
-- But allow workspace owners/admins to read via secure authenticated APIs if needed
REVOKE ALL ON paypal_webhook_events FROM authenticated, anon, public;

ALTER TABLE paypal_api_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select_paypal_ops"
  ON paypal_api_operations FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

REVOKE INSERT, UPDATE, DELETE ON paypal_api_operations FROM authenticated, anon, public;

-- Grant SELECT to authenticated where policies permit
GRANT SELECT ON paypal_invoice_records TO authenticated;
GRANT SELECT ON paypal_api_operations TO authenticated;
