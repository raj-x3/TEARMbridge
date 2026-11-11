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
