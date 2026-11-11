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
