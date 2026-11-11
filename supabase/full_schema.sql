-- 00001_create_workspaces.sql
-- Core multi-tenant workspace and membership tables.

-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces (slug);

-- Workspace Members (links auth.users to workspaces)
CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'reviewer'
                CHECK (role IN ('owner', 'admin', 'finance', 'reviewer')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members (workspace_id);

-- Helper function: check if a user is a member of a workspace.
-- SECURITY DEFINER with fixed search_path for use in RLS policies.
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
  );
$$;

-- Helper function: get workspace IDs for the current user.
CREATE OR REPLACE FUNCTION get_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id
  FROM workspace_members
  WHERE user_id = auth.uid();
$$;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
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
-- 00005_create_documents.sql
-- Document groups, documents (versioned), and entity links.

-- Document Groups (logical document identity across versions)
CREATE TABLE IF NOT EXISTS document_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL DEFAULT 'general'
                  CHECK (document_type IN (
                    'purchase_order', 'agreement', 'amendment',
                    'invoice', 'supporting', 'general'
                  )),
  title           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_groups_workspace ON document_groups (workspace_id);

-- Documents (individual file versions)
CREATE TABLE IF NOT EXISTS documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_group_id       UUID NOT NULL REFERENCES document_groups(id) ON DELETE CASCADE,
  original_filename       TEXT NOT NULL,
  storage_path            TEXT NOT NULL,
  mime_type               TEXT NOT NULL,
  extension               TEXT NOT NULL,
  size_bytes              BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256_checksum         TEXT NOT NULL,
  version_number          INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  supersedes_document_id  UUID REFERENCES documents(id) ON DELETE SET NULL,
  is_current              BOOLEAN NOT NULL DEFAULT true,
  upload_status           TEXT NOT NULL DEFAULT 'stored'
                          CHECK (upload_status IN ('stored', 'upload_failed', 'archived')),
  uploaded_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents (workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_group ON documents (document_group_id);
CREATE INDEX IF NOT EXISTS idx_documents_checksum ON documents (workspace_id, sha256_checksum);
CREATE INDEX IF NOT EXISTS idx_documents_current ON documents (document_group_id, is_current) WHERE is_current = true;

-- Document Links (polymorphic entity association)
CREATE TABLE IF NOT EXISTS document_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_type       TEXT NOT NULL
                    CHECK (entity_type IN ('purchase_order', 'agreement', 'counterparty')),
  entity_id         UUID NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'attachment'
                    CHECK (relationship_type IN ('source', 'attachment', 'reference', 'amendment')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent linking the same document to the same entity multiple times
  UNIQUE (document_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_document_links_entity ON document_links (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_document_links_document ON document_links (document_id);

-- Add foreign key references from agreement_versions and agreement_terms to documents
-- (deferred because documents table didn't exist when those tables were created)
ALTER TABLE agreement_versions
  ADD CONSTRAINT fk_agreement_versions_document
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE agreement_terms
  ADD CONSTRAINT fk_agreement_terms_source_document
  FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE SET NULL;
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
-- 00008_enable_rls.sql
-- Row Level Security policies for workspace isolation.

-- ============================================================================
-- Enable RLS on all workspace data tables
-- ============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Workspaces: users can only see workspaces they belong to
-- ============================================================================

CREATE POLICY "Users can view their workspaces"
  ON workspaces FOR SELECT
  USING (id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Owners and admins can update their workspaces"
  ON workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = workspaces.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- Workspace Members: users can see members of their workspaces
-- ============================================================================

CREATE POLICY "Users can view members of their workspaces"
  ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Owners can manage members"
  ON workspace_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- ============================================================================
-- Counterparties: workspace-scoped CRUD
-- ============================================================================

CREATE POLICY "Users can view counterparties in their workspaces"
  ON counterparties FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert counterparties in their workspaces"
  ON counterparties FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update counterparties in their workspaces"
  ON counterparties FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Commercial Agreements: workspace-scoped CRUD
-- ============================================================================

CREATE POLICY "Users can view agreements in their workspaces"
  ON commercial_agreements FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert agreements in their workspaces"
  ON commercial_agreements FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update agreements in their workspaces"
  ON commercial_agreements FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Agreement Versions: workspace-scoped read/insert
-- ============================================================================

CREATE POLICY "Users can view agreement versions in their workspaces"
  ON agreement_versions FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert agreement versions in their workspaces"
  ON agreement_versions FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Agreement Terms: workspace-scoped CRUD
-- ============================================================================

CREATE POLICY "Users can view agreement terms in their workspaces"
  ON agreement_terms FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert agreement terms in their workspaces"
  ON agreement_terms FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update agreement terms in their workspaces"
  ON agreement_terms FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Purchase Orders: workspace-scoped CRUD
-- ============================================================================

CREATE POLICY "Users can view purchase orders in their workspaces"
  ON purchase_orders FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert purchase orders in their workspaces"
  ON purchase_orders FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update purchase orders in their workspaces"
  ON purchase_orders FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Purchase Order Line Items: workspace-scoped
-- ============================================================================

CREATE POLICY "Users can view PO line items in their workspaces"
  ON purchase_order_line_items FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert PO line items in their workspaces"
  ON purchase_order_line_items FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Document Groups: workspace-scoped
-- ============================================================================

CREATE POLICY "Users can view document groups in their workspaces"
  ON document_groups FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert document groups in their workspaces"
  ON document_groups FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Documents: workspace-scoped
-- ============================================================================

CREATE POLICY "Users can view documents in their workspaces"
  ON documents FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert documents in their workspaces"
  ON documents FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update documents in their workspaces"
  ON documents FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Document Links: workspace-scoped
-- ============================================================================

CREATE POLICY "Users can view document links in their workspaces"
  ON document_links FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert document links in their workspaces"
  ON document_links FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Commercial Rules: workspace-scoped
-- ============================================================================

CREATE POLICY "Users can view commercial rules in their workspaces"
  ON commercial_rules FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert commercial rules in their workspaces"
  ON commercial_rules FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can update commercial rules in their workspaces"
  ON commercial_rules FOR UPDATE
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Audit Events: workspace-scoped read-only for users, insert via service
-- ============================================================================

CREATE POLICY "Users can view audit events in their workspaces"
  ON audit_events FOR SELECT
  USING (workspace_id IN (SELECT get_user_workspace_ids()));

CREATE POLICY "Users can insert audit events in their workspaces"
  ON audit_events FOR INSERT
  WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids()));

-- ============================================================================
-- Storage: Private bucket for documents
-- ============================================================================
-- NOTE: The storage bucket 'termbridge-documents' must be created manually
-- in the Supabase Dashboard as a PRIVATE bucket.
-- Then add these storage policies via the Dashboard:
--
-- SELECT: Authenticated users can read files in their workspace path
--   bucket_id = 'termbridge-documents'
--   AND (storage.foldername(name))[1] IN (SELECT get_user_workspace_ids()::text)
--
-- INSERT: Authenticated users can upload to their workspace path
--   bucket_id = 'termbridge-documents'
--   AND (storage.foldername(name))[1] IN (SELECT get_user_workspace_ids()::text)
-- 00009_audit_immutability_and_security.sql
-- Module 2.1: Database Security, Audit Immutability & Polymorphic Link Preflight
--
-- 1. Audit Log Immutability:
--    - Revoke UPDATE, DELETE, and TRUNCATE from authenticated and anon roles.
--    - Install a database-level trigger that raises an exception on any UPDATE or DELETE.
--
-- 2. Polymorphic Document Link Integrity:
--    - Install a trigger on document_links verifying that the referenced entity
--      (purchase_order, commercial_agreement, counterparty) exists AND belongs to the
--      exact same workspace_id as the document.
--
-- 3. Role-Based Access Control (RBAC) Hardening:
--    - Ensure that sensitive mutations (commercial rules, workspace membership)
--      require 'owner', 'admin', or 'finance' roles and cannot be performed by 'reviewer'.

-- ============================================================================
-- 1. AUDIT LOG IMMUTABILITY
-- ============================================================================

-- Explicitly revoke destructive permissions from client roles
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM authenticated, anon, public;

-- Drop any accidental UPDATE/DELETE policies on audit_events if they exist
DROP POLICY IF EXISTS "Users can update audit events" ON audit_events;
DROP POLICY IF EXISTS "Users can delete audit events" ON audit_events;

-- Database trigger to unconditionally block UPDATE and DELETE on audit_events
CREATE OR REPLACE FUNCTION enforce_audit_events_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are cryptographically immutable. UPDATE and DELETE operations are prohibited on audit_events (id: %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_events_immutability();

-- ============================================================================
-- 2. POLYMORPHIC DOCUMENT LINK INTEGRITY TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_polymorphic_document_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_workspace UUID;
  v_entity_exists BOOLEAN := false;
BEGIN
  -- 1. Verify the referenced document exists and belongs to the same workspace
  SELECT workspace_id INTO v_doc_workspace
  FROM documents
  WHERE id = NEW.document_id;

  IF v_doc_workspace IS NULL THEN
    RAISE EXCEPTION 'Referenced document % does not exist.', NEW.document_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_doc_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Cross-workspace document linkage prohibited. Document workspace (%) does not match link workspace (%).',
      v_doc_workspace, NEW.workspace_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- 2. Verify the polymorphic target entity exists within the exact same workspace
  IF NEW.entity_type = 'purchase_order' THEN
    SELECT EXISTS (
      SELECT 1 FROM purchase_orders
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target purchase_order % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'agreement' THEN
    SELECT EXISTS (
      SELECT 1 FROM commercial_agreements
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target commercial_agreement % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'counterparty' THEN
    SELECT EXISTS (
      SELECT 1 FROM counterparties
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target counterparty % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported polymorphic entity_type: %.', NEW.entity_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_polymorphic_document_link ON document_links;
CREATE TRIGGER trg_validate_polymorphic_document_link
  BEFORE INSERT OR UPDATE ON document_links
  FOR EACH ROW
  EXECUTE FUNCTION validate_polymorphic_document_link();

-- ============================================================================
-- 3. WORKSPACE ROLE SECURITY & RBAC HARDENING
-- ============================================================================

-- Helper function to fetch the authenticated user's role in a specific workspace
CREATE OR REPLACE FUNCTION get_user_workspace_role(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Tighten commercial rules mutation: Only 'owner', 'admin', or 'finance' can modify
DROP POLICY IF EXISTS "Users can insert commercial rules in their workspaces" ON commercial_rules;
DROP POLICY IF EXISTS "Users can update commercial rules in their workspaces" ON commercial_rules;

CREATE POLICY "Privileged members can insert commercial rules"
  ON commercial_rules FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND get_user_workspace_role(workspace_id) IN ('owner', 'admin', 'finance')
  );

CREATE POLICY "Privileged members can update commercial rules"
  ON commercial_rules FOR UPDATE
  USING (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND get_user_workspace_role(workspace_id) IN ('owner', 'admin', 'finance')
  );

-- Counterparty mutations: Only 'owner', 'admin', or 'finance' can insert/update
DROP POLICY IF EXISTS "Users can insert counterparties in their workspaces" ON counterparties;
DROP POLICY IF EXISTS "Users can update counterparties in their workspaces" ON counterparties;

CREATE POLICY "Privileged members can insert counterparties"
  ON counterparties FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND get_user_workspace_role(workspace_id) IN ('owner', 'admin', 'finance')
  );

CREATE POLICY "Privileged members can update counterparties"
  ON counterparties FOR UPDATE
  USING (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND get_user_workspace_role(workspace_id) IN ('owner', 'admin', 'finance')
  );

-- Purchase orders mutations: Only 'owner', 'admin', or 'finance' can create POs
DROP POLICY IF EXISTS "Users can insert purchase orders in their workspaces" ON purchase_orders;
CREATE POLICY "Privileged members can insert purchase orders"
  ON purchase_orders FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT get_user_workspace_ids())
    AND get_user_workspace_role(workspace_id) IN ('owner', 'admin', 'finance')
  );
-- 00010_audit_authenticity.sql
-- Module 2.2: Audit Authenticity, TRUNCATE Protection & Secure Append-Only Architecture
--
-- 1. TRUNCATE Protection:
--    - Normal application roles (authenticated, anon, public) cannot TRUNCATE audit_events.
--    - A BEFORE TRUNCATE statement-level trigger blocks any unauthorized truncation attempt.
--    - Privilege boundary note: superusers and PostgreSQL infrastructure admins bypass triggers/grants.
--
-- 2. Audit Event Authenticity & Revocation of Direct INSERT:
--    - Revoke direct INSERT on audit_events from authenticated, anon, and public roles.
--    - Drop client-side direct INSERT RLS policy.
--    - Prevent authenticated clients from arbitrarily forging event types, actor IDs, or workspace IDs.
--    - Restrict event types via a strict CHECK constraint.
--
-- 3. Secure Append Function (append_audit_event):
--    - Narrowly scoped SECURITY DEFINER function with strict parameter validation.
--    - Derives actor identity strictly from auth.uid() (or 'system' in trusted background server contexts).
--    - Validates that actor belongs to the designated workspace.
--    - Validates that the referenced entity exists within that exact same workspace.
--    - Disallows client metadata attempting to falsely claim unverified payments, invoices, or approvals.
--
-- 4. Automatic Database Mutation Auditing:
--    - Database-generated triggers for critical entity lifecycle transitions
--      (e.g., agreement status changes, purchase order status changes).

-- ============================================================================
-- 1. TRUNCATE PROTECTION TRIGGER & GRANTS
-- ============================================================================

-- Explicitly ensure TRUNCATE is revoked
REVOKE TRUNCATE ON audit_events FROM authenticated, anon, public;

-- Statement-level trigger blocking any TRUNCATE attempt
CREATE OR REPLACE FUNCTION block_audit_events_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are tamper-proof. TRUNCATE operation is prohibited on audit_events.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_block_truncate ON audit_events;
CREATE TRIGGER trg_audit_events_block_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION block_audit_events_truncate();

-- ============================================================================
-- 2. REVOKE DIRECT INSERT & STRICT EVENT_TYPE CONSTRAINT
-- ============================================================================

-- Revoke direct INSERT from application and anonymous clients
REVOKE INSERT ON audit_events FROM authenticated, anon, public;

-- Drop permissive INSERT policy from 00008
DROP POLICY IF EXISTS "Users can insert audit events in their workspaces" ON audit_events;

-- Enforce explicit supported event types constraint
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS chk_audit_event_type;
ALTER TABLE audit_events ADD CONSTRAINT chk_audit_event_type
  CHECK (event_type IN (
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
    'workspace.member_removed'
  ));

-- ============================================================================
-- 3. SECURE APPEND-ONLY FUNCTION (append_audit_event)
-- ============================================================================

CREATE OR REPLACE FUNCTION append_audit_event(
  p_workspace_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_event_type TEXT,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
  v_new_id UUID;
BEGIN
  -- 1. Derive actor strictly from authenticated session context
  v_actor_id := auth.uid();

  -- If an authenticated user is calling, verify membership in the target workspace
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION 'Access denied. User % is not a member of workspace %.', v_actor_id, p_workspace_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. Reject unverified financial or approval claims in metadata
  IF p_details ? 'payment_verified'
     OR p_details ? 'payment_completed'
     OR p_details ? 'invoice_approved'
     OR p_details ? 'payout_completed'
     OR p_details ? 'paypal_transaction_verified' THEN
    RAISE EXCEPTION 'Unauthorized metadata detected: unverified financial verification claims cannot be submitted by client callers.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Validate entity existence within the specified workspace
  IF p_entity_type = 'purchase_order' THEN
    IF NOT EXISTS (SELECT 1 FROM purchase_orders WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced purchase_order % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'agreement' THEN
    IF NOT EXISTS (SELECT 1 FROM commercial_agreements WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_agreement % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'counterparty' THEN
    IF NOT EXISTS (SELECT 1 FROM counterparties WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced counterparty % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'document' THEN
    IF NOT EXISTS (SELECT 1 FROM documents WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced document % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'commercial_rule' THEN
    IF NOT EXISTS (SELECT 1 FROM commercial_rules WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_rule % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'workspace' THEN
    IF NOT EXISTS (SELECT 1 FROM workspaces WHERE id = p_entity_id AND id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced workspace % does not match target workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported entity_type for audit event: %.', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 4. Insert audit record with server-derived actor and timestamp
  INSERT INTO audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    p_workspace_id,
    v_actor_id,
    CASE WHEN v_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
    p_entity_type,
    p_entity_id,
    p_event_type,
    COALESCE(p_details, '{}'::jsonb),
    now()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Grant EXECUTE permission to authenticated and service_role
GRANT EXECUTE ON FUNCTION append_audit_event(UUID, TEXT, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ============================================================================
-- 4. DATABASE-GENERATED AUDIT TRIGGERS FOR KEY MUTATIONS
-- ============================================================================

-- Trigger for commercial agreement status changes
CREATE OR REPLACE FUNCTION audit_agreement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'agreement',
      NEW.id,
      'agreement.status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'agreement_reference', NEW.agreement_reference
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_status ON commercial_agreements;
CREATE TRIGGER trg_audit_agreement_status
  AFTER UPDATE OF status ON commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION audit_agreement_status_change();

-- Trigger for purchase order status changes
CREATE OR REPLACE FUNCTION audit_purchase_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'purchase_order',
      NEW.id,
      'purchase_order.status_changed',
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'po_number', NEW.po_number
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_status ON purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_status
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION audit_purchase_order_status_change();
-- 00011_harden_audit_rpc_and_search_paths.sql
-- Module 2.3: Final Audit RPC Security Review & Search Path Hardening
--
-- 1. Secure Audit RPC Permissions:
--    - Revoke EXECUTE on append_audit_event from PUBLIC, anon, and authenticated.
--    - Grant EXECUTE strictly to service_role (trusted server-side execution only).
--    - Prevents ordinary authenticated users or reviewers from fabricating audit records via PostgREST RPC.
--
-- 2. Automated Database-Generated Mutation Triggers:
--    - Trigger on purchase_orders: AFTER INSERT logs 'purchase_order.created'.
--    - Trigger on commercial_agreements: AFTER INSERT logs 'agreement.created'.
--    - Trigger on counterparties: AFTER INSERT logs 'counterparty.created'.
--    - Trigger on documents: AFTER INSERT logs 'document.uploaded' or 'document.version_added'.
--    - Trigger on commercial_agreements: AFTER UPDATE OF status logs 'agreement.status_changed'.
--    - Trigger on purchase_orders: AFTER UPDATE OF status logs 'purchase_order.status_changed'.
--    - All trigger functions are SECURITY DEFINER with SET search_path = '' so authorized users
--      can mutate entities while trigger securely records the audit row without exposing direct INSERT.
--
-- 3. Harden Search Paths Across ALL SECURITY DEFINER Functions:
--    - Replaces SET search_path = public with SET search_path = ''
--    - Fully qualifies all tables, types, operators, and functions with schema names
--      (public.*, pg_catalog.*, auth.*).

-- ============================================================================
-- 1. HARDEN SECURITY DEFINER SEARCH PATHS ON CORE FUNCTIONS
-- ============================================================================

-- A. Workspace ID resolver for RLS
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids()
RETURNS SETOF pg_catalog.uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- B. Updated_at column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- C. Workspace member role resolver
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_workspace_id pg_catalog.uuid)
RETURNS pg_catalog.text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- D. Audit events immutability trigger function (blocks UPDATE and DELETE)
CREATE OR REPLACE FUNCTION public.enforce_audit_events_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are cryptographically immutable. UPDATE and DELETE operations are prohibited on audit_events (id: %)', OLD.id
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- E. Audit events TRUNCATE protection trigger function
CREATE OR REPLACE FUNCTION public.block_audit_events_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail records are tamper-proof. TRUNCATE operation is prohibited on audit_events.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- F. Polymorphic document link integrity validation trigger function
CREATE OR REPLACE FUNCTION public.validate_polymorphic_document_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_doc_workspace pg_catalog.uuid;
  v_entity_exists pg_catalog.bool := false;
BEGIN
  -- 1. Verify referenced document exists and belongs to the same workspace
  SELECT workspace_id INTO v_doc_workspace
  FROM public.documents
  WHERE id = NEW.document_id;

  IF v_doc_workspace IS NULL THEN
    RAISE EXCEPTION 'Referenced document % does not exist.', NEW.document_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_doc_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Cross-workspace document linkage prohibited. Document workspace (%) does not match link workspace (%).',
      v_doc_workspace, NEW.workspace_id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- 2. Verify target entity exists within the exact same workspace
  IF NEW.entity_type = 'purchase_order' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.purchase_orders
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target purchase_order % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'agreement' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.commercial_agreements
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target commercial_agreement % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSIF NEW.entity_type = 'counterparty' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.counterparties
      WHERE id = NEW.entity_id AND workspace_id = NEW.workspace_id
    ) INTO v_entity_exists;

    IF NOT v_entity_exists THEN
      RAISE EXCEPTION 'Target counterparty % does not exist in workspace %.', NEW.entity_id, NEW.workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported polymorphic entity_type: %.', NEW.entity_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. SECURE append_audit_event WITH EMPTY SEARCH PATH & RESTRICTED ACCESS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.append_audit_event(
  p_workspace_id pg_catalog.uuid,
  p_entity_type pg_catalog.text,
  p_entity_id pg_catalog.uuid,
  p_event_type pg_catalog.text,
  p_details pg_catalog.jsonb DEFAULT '{}'::pg_catalog.jsonb
)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id pg_catalog.uuid;
  v_new_id pg_catalog.uuid;
BEGIN
  -- 1. Derive actor strictly from authenticated session context
  v_actor_id := auth.uid();

  -- If an authenticated user is calling, verify membership in the target workspace
  IF v_actor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = p_workspace_id AND user_id = v_actor_id
    ) THEN
      RAISE EXCEPTION 'Access denied. User % is not a member of workspace %.', v_actor_id, p_workspace_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. Reject unverified financial or approval claims in metadata
  IF (p_details ? 'payment_verified')
     OR (p_details ? 'payment_completed')
     OR (p_details ? 'invoice_approved')
     OR (p_details ? 'payout_completed')
     OR (p_details ? 'paypal_transaction_verified') THEN
    RAISE EXCEPTION 'Unauthorized metadata detected: unverified financial verification claims cannot be submitted by client callers.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. Validate entity existence within the specified workspace
  IF p_entity_type = 'purchase_order' THEN
    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced purchase_order % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'agreement' THEN
    IF NOT EXISTS (SELECT 1 FROM public.commercial_agreements WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_agreement % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'counterparty' THEN
    IF NOT EXISTS (SELECT 1 FROM public.counterparties WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced counterparty % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'document' THEN
    IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced document % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'commercial_rule' THEN
    IF NOT EXISTS (SELECT 1 FROM public.commercial_rules WHERE id = p_entity_id AND workspace_id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced commercial_rule % does not exist in workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF p_entity_type = 'workspace' THEN
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_entity_id AND id = p_workspace_id) THEN
      RAISE EXCEPTION 'Referenced workspace % does not match target workspace %.', p_entity_id, p_workspace_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported entity_type for audit event: %.', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 4. Insert audit record with server-derived actor and timestamp
  INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    p_workspace_id,
    v_actor_id,
    CASE WHEN v_actor_id IS NOT NULL THEN 'user' ELSE 'system' END,
    p_entity_type,
    p_entity_id,
    p_event_type,
    COALESCE(p_details, '{}'::jsonb),
    pg_catalog.now()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Revoke all EXECUTE permissions from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.append_audit_event(pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE exclusively to service_role (trusted server-side execution only)
GRANT EXECUTE ON FUNCTION public.append_audit_event(pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb) TO service_role;

-- ============================================================================
-- 3. AUTOMATIC DATABASE MUTATION AUDIT TRIGGERS (SECURITY DEFINER)
-- ============================================================================

-- A. Purchase Order Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_purchase_order_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    NEW.workspace_id,
    auth.uid(),
    CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
    'purchase_order',
    NEW.id,
    'purchase_order.created',
    pg_catalog.jsonb_build_object(
      'po_number', NEW.po_number,
      'total_amount', NEW.total_amount,
      'currency', NEW.currency,
      'buyer_id', NEW.buyer_id
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_creation ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_creation
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_purchase_order_creation();

-- B. Purchase Order Status Change Trigger
CREATE OR REPLACE FUNCTION public.audit_purchase_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'purchase_order',
      NEW.id,
      'purchase_order.status_changed',
      pg_catalog.jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'po_number', NEW.po_number
      ),
      pg_catalog.now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_purchase_order_status ON public.purchase_orders;
CREATE TRIGGER trg_audit_purchase_order_status
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_purchase_order_status_change();

-- C. Agreement Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_agreement_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    NEW.workspace_id,
    auth.uid(),
    CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
    'agreement',
    NEW.id,
    'agreement.created',
    pg_catalog.jsonb_build_object(
      'agreement_reference', NEW.agreement_reference,
      'title', NEW.title,
      'currency', NEW.currency,
      'status', NEW.status
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_creation ON public.commercial_agreements;
CREATE TRIGGER trg_audit_agreement_creation
  AFTER INSERT ON public.commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_agreement_creation();

-- D. Agreement Status Change Trigger
CREATE OR REPLACE FUNCTION public.audit_agreement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_events (
      workspace_id,
      actor_id,
      actor_type,
      entity_type,
      entity_id,
      event_type,
      details,
      created_at
    ) VALUES (
      NEW.workspace_id,
      auth.uid(),
      CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
      'agreement',
      NEW.id,
      'agreement.status_changed',
      pg_catalog.jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'agreement_reference', NEW.agreement_reference
      ),
      pg_catalog.now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_agreement_status ON public.commercial_agreements;
CREATE TRIGGER trg_audit_agreement_status
  AFTER UPDATE OF status ON public.commercial_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_agreement_status_change();

-- E. Counterparty Creation Trigger
CREATE OR REPLACE FUNCTION public.audit_counterparty_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    NEW.workspace_id,
    auth.uid(),
    CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
    'counterparty',
    NEW.id,
    'counterparty.created',
    pg_catalog.jsonb_build_object(
      'display_name', NEW.display_name,
      'legal_name', NEW.legal_name,
      'entity_type', NEW.entity_type,
      'currency', NEW.currency
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_counterparty_creation ON public.counterparties;
CREATE TRIGGER trg_audit_counterparty_creation
  AFTER INSERT ON public.counterparties
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_counterparty_creation();

-- F. Document Creation Trigger (Uploaded & Version Added)
CREATE OR REPLACE FUNCTION public.audit_document_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    entity_type,
    entity_id,
    event_type,
    details,
    created_at
  ) VALUES (
    NEW.workspace_id,
    auth.uid(),
    CASE WHEN auth.uid() IS NOT NULL THEN 'user' ELSE 'system' END,
    'document',
    NEW.id,
    CASE WHEN NEW.version_number > 1 THEN 'document.version_added' ELSE 'document.uploaded' END,
    pg_catalog.jsonb_build_object(
      'file_name', NEW.file_name,
      'mime_type', NEW.mime_type,
      'file_size_bytes', NEW.file_size_bytes,
      'version_number', NEW.version_number,
      'sha256_hash', NEW.sha256_hash
    ),
    pg_catalog.now()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_document_creation ON public.documents;
CREATE TRIGGER trg_audit_document_creation
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_document_creation();
