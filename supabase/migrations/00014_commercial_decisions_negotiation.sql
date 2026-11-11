-- 00014_commercial_decisions_negotiation.sql
-- Module 4: Commercial Decision & Negotiation Engine
-- Creates: commercial_decisions, counteroffers, counteroffer_versions,
--          counteroffer_approvals, counteroffer_access_tokens, finalized_transactions
-- Extends: audit_events entity_type and event_type constraints

-- ============================================================================
-- 1. EXTEND audit_events CONSTRAINTS FOR MODULE 4 ENTITIES
-- ============================================================================

-- ---- entity_type constraint ------------------------------------------------
-- Drop existing inline CHECK (defined in 00007) and re-add with new values.
-- The original constraint was unnamed (inline), so we target the pg-generated
-- name pattern; using IF EXISTS guards against naming variations.
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_entity_type_check;

ALTER TABLE audit_events ADD CONSTRAINT audit_events_entity_type_check
  CHECK (entity_type IN (
    -- original values (00007)
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
    'finalized_transaction'
  ));

-- ---- event_type constraint -------------------------------------------------
-- Drop existing constraint added in 00010 and re-add with new values.
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_event_type;

ALTER TABLE audit_events ADD CONSTRAINT chk_audit_event_type
  CHECK (event_type IN (
    -- original values (00010)
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
    -- module 4 additions
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
    'transaction.finalized'
  ));

-- ============================================================================
-- 2. TABLE: commercial_decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS commercial_decisions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agreement_id             UUID        NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
  purchase_order_id        UUID        REFERENCES purchase_orders(id) ON DELETE SET NULL,
  analysis_run_id          UUID        REFERENCES analysis_runs(id) ON DELETE SET NULL,
  decision_status          TEXT        NOT NULL
                                       CHECK (decision_status IN (
                                         'ready_without_changes',
                                         'requires_counteroffer',
                                         'requires_internal_approval',
                                         'blocked',
                                         'needs_more_information'
                                       )),
  evaluation_results       JSONB       NOT NULL DEFAULT '{}',
  applicable_rule_versions JSONB       NOT NULL DEFAULT '[]',
  evaluated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  evaluated_by             UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_decisions_workspace
  ON commercial_decisions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_commercial_decisions_agreement
  ON commercial_decisions (agreement_id);
CREATE INDEX IF NOT EXISTS idx_commercial_decisions_analysis_run
  ON commercial_decisions (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_commercial_decisions_workspace_agreement
  ON commercial_decisions (workspace_id, agreement_id);

-- ============================================================================
-- 3. TABLE: counteroffers
-- ============================================================================

CREATE TABLE IF NOT EXISTS counteroffers (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  commercial_decision_id  UUID        NOT NULL REFERENCES commercial_decisions(id) ON DELETE CASCADE,
  agreement_id            UUID        NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
  purchase_order_id       UUID        REFERENCES purchase_orders(id) ON DELETE SET NULL,
  buyer_id                UUID        REFERENCES counterparties(id) ON DELETE SET NULL,
  supplier_id             UUID        REFERENCES counterparties(id) ON DELETE SET NULL,
  status                  TEXT        NOT NULL DEFAULT 'draft'
                                      CHECK (status IN (
                                        'draft',
                                        'seller_review',
                                        'awaiting_buyer',
                                        'buyer_requested_changes',
                                        'accepted',
                                        'rejected',
                                        'withdrawn',
                                        'expired',
                                        'superseded'
                                      )),
  current_version         INTEGER     NOT NULL DEFAULT 1,
  currency                TEXT        NOT NULL DEFAULT 'USD',
  expires_at              TIMESTAMPTZ,
  created_by              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counteroffers_workspace
  ON counteroffers (workspace_id);
CREATE INDEX IF NOT EXISTS idx_counteroffers_agreement
  ON counteroffers (agreement_id);
CREATE INDEX IF NOT EXISTS idx_counteroffers_commercial_decision
  ON counteroffers (commercial_decision_id);
CREATE INDEX IF NOT EXISTS idx_counteroffers_workspace_status
  ON counteroffers (workspace_id, status);

-- updated_at auto-maintenance trigger (uses function from 00011)
DROP TRIGGER IF EXISTS trg_counteroffers_updated_at ON counteroffers;
CREATE TRIGGER trg_counteroffers_updated_at
  BEFORE UPDATE ON counteroffers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. TABLE: counteroffer_versions  (immutable after creation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS counteroffer_versions (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID    NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  counteroffer_id UUID    NOT NULL REFERENCES counteroffers(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  proposed_terms  JSONB   NOT NULL DEFAULT '{}',
  original_terms  JSONB   NOT NULL DEFAULT '{}',
  financial_summary JSONB NOT NULL DEFAULT '{}',
  terms_hash      TEXT    NOT NULL,
  explanation     TEXT,
  created_by      UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (counteroffer_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_counteroffer_versions_workspace
  ON counteroffer_versions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_counteroffer_versions_counteroffer
  ON counteroffer_versions (counteroffer_id);

-- Immutability enforcement function
CREATE OR REPLACE FUNCTION enforce_counteroffer_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'Counteroffer versions are immutable after creation. Version % cannot be modified.',
    OLD.version_number
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_counteroffer_versions_immutable ON counteroffer_versions;
CREATE TRIGGER trg_counteroffer_versions_immutable
  BEFORE UPDATE OR DELETE ON counteroffer_versions
  FOR EACH ROW EXECUTE FUNCTION enforce_counteroffer_version_immutability();

-- Revoke direct mutation privileges from application roles
REVOKE UPDATE, DELETE ON counteroffer_versions FROM authenticated, anon, public;

-- ============================================================================
-- 5. TABLE: counteroffer_approvals
-- ============================================================================

CREATE TABLE IF NOT EXISTS counteroffer_approvals (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  counteroffer_id          UUID        NOT NULL REFERENCES counteroffers(id) ON DELETE CASCADE,
  counteroffer_version_id  UUID        NOT NULL REFERENCES counteroffer_versions(id) ON DELETE CASCADE,
  approver_type            TEXT        NOT NULL
                                       CHECK (approver_type IN ('seller', 'buyer')),
  approver_user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email          TEXT,
  approval_status          TEXT        NOT NULL DEFAULT 'pending'
                                       CHECK (approval_status IN (
                                         'pending',
                                         'approved',
                                         'rejected',
                                         'requested_changes'
                                       )),
  confirmation_method      TEXT        NOT NULL DEFAULT 'internal_session'
                                       CHECK (confirmation_method IN (
                                         'internal_session',
                                         'secure_bearer_link'
                                       )),
  identity_verified        BOOLEAN     NOT NULL DEFAULT false,
  approved_at              TIMESTAMPTZ,
  rejection_notes          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counteroffer_approvals_workspace
  ON counteroffer_approvals (workspace_id);
CREATE INDEX IF NOT EXISTS idx_counteroffer_approvals_counteroffer
  ON counteroffer_approvals (counteroffer_id);
CREATE INDEX IF NOT EXISTS idx_counteroffer_approvals_version
  ON counteroffer_approvals (counteroffer_version_id);
CREATE INDEX IF NOT EXISTS idx_counteroffer_approvals_counteroffer_type
  ON counteroffer_approvals (counteroffer_id, approver_type);

-- ============================================================================
-- 6. TABLE: counteroffer_access_tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS counteroffer_access_tokens (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  counteroffer_id         UUID        NOT NULL REFERENCES counteroffers(id) ON DELETE CASCADE,
  counteroffer_version_id UUID        NOT NULL REFERENCES counteroffer_versions(id) ON DELETE CASCADE,
  recipient_email         TEXT        NOT NULL,
  token_hash              TEXT        NOT NULL UNIQUE,
  expires_at              TIMESTAMPTZ NOT NULL,
  consumed_at             TIMESTAMPTZ,
  attempt_count           INTEGER     NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counteroffer_access_tokens_hash
  ON counteroffer_access_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_counteroffer_access_tokens_counteroffer
  ON counteroffer_access_tokens (counteroffer_id);
-- Partial index: only active (unconsumed) tokens for expiry sweeps
CREATE INDEX IF NOT EXISTS idx_counteroffer_access_tokens_expires_active
  ON counteroffer_access_tokens (expires_at)
  WHERE consumed_at IS NULL;

-- ============================================================================
-- 7. TABLE: finalized_transactions  (immutable after creation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS finalized_transactions (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID           NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  counteroffer_id         UUID           NOT NULL REFERENCES counteroffers(id) ON DELETE RESTRICT,
  counteroffer_version_id UUID           NOT NULL REFERENCES counteroffer_versions(id) ON DELETE RESTRICT,
  purchase_order_id       UUID           REFERENCES purchase_orders(id) ON DELETE SET NULL,
  agreement_id            UUID           REFERENCES commercial_agreements(id) ON DELETE SET NULL,
  transaction_snapshot    JSONB          NOT NULL,
  snapshot_hash           TEXT           NOT NULL,
  currency                TEXT           NOT NULL DEFAULT 'USD',
  subtotal                NUMERIC(15,2)  NOT NULL CHECK (subtotal >= 0),
  discount_total          NUMERIC(15,2)  NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total               NUMERIC(15,2)  NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  shipping_total          NUMERIC(15,2)  NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  grand_total             NUMERIC(15,2)  NOT NULL CHECK (grand_total >= 0),
  buyer_email             TEXT,
  transaction_status      TEXT           NOT NULL DEFAULT 'ready_for_invoice'
                                         CHECK (transaction_status IN (
                                           'ready_for_invoice',
                                           'invoicing',
                                           'invoiced',
                                           'paid',
                                           'cancelled'
                                         )),
  finalized_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
  finalized_by            UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (counteroffer_id, counteroffer_version_id)
);

CREATE INDEX IF NOT EXISTS idx_finalized_transactions_workspace
  ON finalized_transactions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_finalized_transactions_counteroffer
  ON finalized_transactions (counteroffer_id);
CREATE INDEX IF NOT EXISTS idx_finalized_transactions_workspace_status
  ON finalized_transactions (workspace_id, transaction_status);

-- Immutability enforcement function
CREATE OR REPLACE FUNCTION enforce_finalized_transaction_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION
    'Finalized transactions are immutable. Record % cannot be modified or deleted.',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_finalized_transactions_immutable ON finalized_transactions;
CREATE TRIGGER trg_finalized_transactions_immutable
  BEFORE UPDATE OR DELETE ON finalized_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_finalized_transaction_immutability();

-- Revoke direct mutation privileges from application roles
REVOKE UPDATE, DELETE ON finalized_transactions FROM authenticated, anon, public;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- ---- commercial_decisions --------------------------------------------------
ALTER TABLE commercial_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select"
  ON commercial_decisions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- No direct INSERT/UPDATE/DELETE from application roles
REVOKE INSERT, UPDATE, DELETE ON commercial_decisions FROM authenticated, anon, public;

-- ---- counteroffers ---------------------------------------------------------
ALTER TABLE counteroffers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select"
  ON counteroffers FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- INSERT/UPDATE controlled only by server via service_role bypass; no explicit policy needed.

-- ---- counteroffer_versions -------------------------------------------------
ALTER TABLE counteroffer_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select"
  ON counteroffer_versions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Additional protection on top of immutability trigger
REVOKE INSERT, UPDATE, DELETE ON counteroffer_versions FROM authenticated, anon, public;

-- ---- counteroffer_approvals ------------------------------------------------
ALTER TABLE counteroffer_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select"
  ON counteroffer_approvals FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- INSERT/UPDATE controlled only by server via service_role bypass.

-- ---- counteroffer_access_tokens --------------------------------------------
-- NO SELECT policy for authenticated users — only service_role reads tokens.
ALTER TABLE counteroffer_access_tokens ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON counteroffer_access_tokens FROM authenticated, anon, public;

-- ---- finalized_transactions ------------------------------------------------
ALTER TABLE finalized_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_can_select"
  ON finalized_transactions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Additional protection on top of immutability trigger
REVOKE INSERT, UPDATE, DELETE ON finalized_transactions FROM authenticated, anon, public;

-- ============================================================================
-- 9. GRANT SELECT TO authenticated
-- ============================================================================

GRANT SELECT ON commercial_decisions      TO authenticated;
GRANT SELECT ON counteroffers             TO authenticated;
GRANT SELECT ON counteroffer_versions     TO authenticated;
GRANT SELECT ON counteroffer_approvals    TO authenticated;
GRANT SELECT ON finalized_transactions    TO authenticated;
-- counteroffer_access_tokens: NO grant to authenticated (service_role only)
