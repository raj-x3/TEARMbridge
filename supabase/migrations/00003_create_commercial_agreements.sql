-- 00003_create_commercial_agreements.sql
-- Commercial agreements, versions, and terms.

-- Commercial Agreements
CREATE TABLE IF NOT EXISTS commercial_agreements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agreement_reference   TEXT NOT NULL,
  buyer_id              UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
  supplier_id           UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN (
                          'draft', 'needs_review', 'counteroffer_sent',
                          'awaiting_counterparty', 'ready_to_invoice',
                          'completed', 'cancelled'
                        )),
  currency              TEXT NOT NULL DEFAULT 'USD',
  effective_date        DATE,
  expiry_date           DATE,
  default_payment_terms TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Agreement references must be unique within a workspace
  UNIQUE (workspace_id, agreement_reference)
);

CREATE INDEX IF NOT EXISTS idx_agreements_workspace ON commercial_agreements (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON commercial_agreements (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agreements_buyer ON commercial_agreements (buyer_id);

CREATE TRIGGER trg_agreements_updated_at
  BEFORE UPDATE ON commercial_agreements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Agreement Versions (immutable history)
CREATE TABLE IF NOT EXISTS agreement_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agreement_id      UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  version_label     TEXT,
  effective_date    DATE,
  document_id       UUID,  -- will reference documents table after it's created
  change_summary    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agreement_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_agreement_versions_agreement ON agreement_versions (agreement_id);

-- Agreement Terms
CREATE TABLE IF NOT EXISTS agreement_terms (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agreement_id            UUID NOT NULL REFERENCES commercial_agreements(id) ON DELETE CASCADE,
  agreement_version_id    UUID REFERENCES agreement_versions(id) ON DELETE SET NULL,
  term_key                TEXT NOT NULL,
  term_label              TEXT NOT NULL,
  term_category           TEXT NOT NULL DEFAULT 'general'
                          CHECK (term_category IN (
                            'pricing', 'quantity', 'payment', 'delivery',
                            'discount', 'penalty', 'general'
                          )),
  term_value              JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency                TEXT,
  source_document_id      UUID,  -- will reference documents table
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreement_terms_agreement ON agreement_terms (agreement_id);
CREATE INDEX IF NOT EXISTS idx_agreement_terms_category ON agreement_terms (workspace_id, term_category);

CREATE TRIGGER trg_agreement_terms_updated_at
  BEFORE UPDATE ON agreement_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
