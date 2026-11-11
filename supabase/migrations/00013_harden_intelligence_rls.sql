-- 00013_harden_intelligence_rls.sql
-- Module 3.1: Harden Intelligence Database Writes & Prevent Direct Client Forgery
--
-- Security Objectives:
-- 1. Revoke direct INSERT, UPDATE, DELETE, TRUNCATE on all intelligence tables
--    (analysis_runs, document_extractions, analysis_findings, analysis_evidence)
--    from client roles (authenticated, anon, public).
-- 2. Prevent normal authenticated users (even finance/admin) from bypassing AI pipeline
--    to directly fabricate findings, runs, or pre-marked 'verified_exact' evidence records.
-- 3. Maintain legitimate SELECT access for workspace members via Row Level Security (RLS).
-- 4. Grant full write access exclusively to trusted server-side execution (service_role).
-- 5. Human review workflows are mediated strictly through authorized server API routes.

-- ============================================================================
-- 1. DROP OBSOLETE CLIENT INSERT/UPDATE POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Privileged members can insert analysis runs" ON public.analysis_runs;
DROP POLICY IF EXISTS "Privileged members can update analysis runs" ON public.analysis_runs;

DROP POLICY IF EXISTS "Privileged members can insert document extractions" ON public.document_extractions;

DROP POLICY IF EXISTS "Privileged members can insert analysis findings" ON public.analysis_findings;
DROP POLICY IF EXISTS "Privileged members can update analysis findings" ON public.analysis_findings;

DROP POLICY IF EXISTS "Privileged members can insert analysis evidence" ON public.analysis_evidence;

-- ============================================================================
-- 2. REVOKE DIRECT MUTATION PRIVILEGES FROM CLIENT ROLES
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_runs FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.document_extractions FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_findings FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_evidence FROM authenticated, anon, public;

-- ============================================================================
-- 3. GRANT SELECT PERMISSIONS TO AUTHENTICATED MEMBERS
-- ============================================================================

GRANT SELECT ON public.analysis_runs TO authenticated;
GRANT SELECT ON public.document_extractions TO authenticated;
GRANT SELECT ON public.analysis_findings TO authenticated;
GRANT SELECT ON public.analysis_evidence TO authenticated;

-- ============================================================================
-- 4. GRANT EXCLUSIVE PRIVILEGED ACCESS TO SERVICE ROLE
-- ============================================================================

GRANT ALL ON public.analysis_runs TO service_role;
GRANT ALL ON public.document_extractions TO service_role;
GRANT ALL ON public.analysis_findings TO service_role;
GRANT ALL ON public.analysis_evidence TO service_role;

-- ============================================================================
-- 5. ENSURE WORKSPACE ISOLATION SELECT POLICIES
-- ============================================================================

-- Ensure RLS remains enabled
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_evidence ENABLE ROW LEVEL SECURITY;

-- Analysis Runs SELECT Policy
DROP POLICY IF EXISTS "Members can view analysis runs in their workspaces" ON public.analysis_runs;
CREATE POLICY "Members can view analysis runs in their workspaces"
  ON public.analysis_runs FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Document Extractions SELECT Policy
DROP POLICY IF EXISTS "Members can view document extractions in their workspaces" ON public.document_extractions;
CREATE POLICY "Members can view document extractions in their workspaces"
  ON public.document_extractions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Analysis Findings SELECT Policy
DROP POLICY IF EXISTS "Members can view analysis findings in their workspaces" ON public.analysis_findings;
CREATE POLICY "Members can view analysis findings in their workspaces"
  ON public.analysis_findings FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- Analysis Evidence SELECT Policy
DROP POLICY IF EXISTS "Members can view analysis evidence in their workspaces" ON public.analysis_evidence;
CREATE POLICY "Members can view analysis evidence in their workspaces"
  ON public.analysis_evidence FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));
