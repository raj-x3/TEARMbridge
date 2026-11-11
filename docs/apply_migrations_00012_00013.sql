-- ============================================================================
-- TERMBRIDGE: Combined Remote Deployment Script (Migrations 00012 & 00013)
-- Target Project: hbumupohjfcizylvnyxo (Supabase SQL Editor)
-- Status: Idempotent, Safe (No Destructive Operations, No Data Reset)
-- ============================================================================

-- ============================================================================
-- PART 1: 00012_commercial_intelligence.sql
-- ============================================================================

-- 00012_commercial_intelligence.sql
-- Module 3: Gemini Commercial Intelligence Engine
--
-- Tables:
-- 1. analysis_runs: Tracks intelligence run lifecycles, statuses, fingerprints, and metrics.
-- 2. document_extractions: Isolated structured facts extracted per document.
-- 3. analysis_findings: Reconciled terms, discrepancies, severities, and human reviews.
-- 4. analysis_evidence: Traceable citations with verification status and exact source locators.

-- ============================================================================
-- 1. ANALYSIS RUNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agreement_id        UUID NOT NULL REFERENCES public.commercial_agreements(id) ON DELETE CASCADE,
  purchase_order_id   UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  model_provider      TEXT NOT NULL DEFAULT 'google',
  model_id            TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  prompt_version      TEXT NOT NULL DEFAULT '1.0.0',
  input_fingerprint   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued',
                        'retrieving_documents',
                        'preprocessing',
                        'extracting_facts',
                        'reconciling_terms',
                        'validating_evidence',
                        'validating_commercial_values',
                        'saving_results',
                        'completed',
                        'completed_with_warnings',
                        'needs_review',
                        'failed'
                      )),
  initiated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_code          TEXT,
  error_message_safe  TEXT,
  input_token_count   INTEGER,
  output_token_count  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_workspace ON public.analysis_runs (workspace_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_agreement ON public.analysis_runs (agreement_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_fingerprint ON public.analysis_runs (workspace_id, input_fingerprint);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON public.analysis_runs (workspace_id, status);

-- ============================================================================
-- 2. DOCUMENT EXTRACTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_extractions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  analysis_run_id         UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  document_id             UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version        INTEGER NOT NULL DEFAULT 1 CHECK (document_version > 0),
  document_classification TEXT NOT NULL
                          CHECK (document_classification IN (
                            'master_agreement',
                            'amendment',
                            'purchase_order',
                            'supporting_document',
                            'unknown'
                          )),
  extracted_facts         JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_status       TEXT NOT NULL DEFAULT 'extracted'
                          CHECK (extraction_status IN ('extracted', 'partial', 'failed', 'empty')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_extractions_run ON public.document_extractions (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_document_extractions_doc ON public.document_extractions (document_id);

-- ============================================================================
-- 3. ANALYSIS FINDINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_findings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  analysis_run_id       UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  term_key              TEXT NOT NULL,
  term_label            TEXT NOT NULL,
  finding_type          TEXT NOT NULL
                        CHECK (finding_type IN (
                          'matched',
                          'conflict',
                          'missing_in_purchase_order',
                          'missing_in_agreement',
                          'ambiguous',
                          'unsupported',
                          'unverifiable'
                        )),
  severity              TEXT NOT NULL
                        CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
  agreement_value       JSONB,
  amendment_value       JSONB,
  purchase_order_value  JSONB,
  explanation           TEXT NOT NULL,
  confidence            NUMERIC(3,2) CHECK (confidence >= 0.0 AND confidence <= 1.0),
  review_status         TEXT NOT NULL DEFAULT 'unreviewed'
                        CHECK (review_status IN ('unreviewed', 'confirmed', 'dismissed', 'needs_more_information')),
  reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_findings_run ON public.analysis_findings (analysis_run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_term ON public.analysis_findings (term_key);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_type ON public.analysis_findings (finding_type);
CREATE INDEX IF NOT EXISTS idx_analysis_findings_review ON public.analysis_findings (review_status);

-- ============================================================================
-- 4. ANALYSIS EVIDENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.analysis_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  analysis_run_id       UUID NOT NULL REFERENCES public.analysis_runs(id) ON DELETE CASCADE,
  finding_id            UUID NOT NULL REFERENCES public.analysis_findings(id) ON DELETE CASCADE,
  document_id           UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  source_ref            TEXT NOT NULL,
  location_type         TEXT NOT NULL
                        CHECK (location_type IN (
                          'pdf_page',
                          'docx_paragraph',
                          'docx_table',
                          'xlsx_cell',
                          'csv_cell',
                          'txt_line',
                          'visual_location'
                        )),
  location              JSONB NOT NULL DEFAULT '{}'::jsonb,
  quote                 TEXT,
  verification_status   TEXT NOT NULL DEFAULT 'unverified'
                        CHECK (verification_status IN (
                          'verified_exact',
                          'verified_normalized',
                          'visually_located_unverified',
                          'not_found',
                          'invalid_source'
                        )),
  verification_method   TEXT NOT NULL DEFAULT 'exact'
                        CHECK (verification_method IN ('exact', 'normalized_whitespace', 'visual_native', 'none')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_evidence_finding ON public.analysis_evidence (finding_id);
CREATE INDEX IF NOT EXISTS idx_analysis_evidence_doc ON public.analysis_evidence (document_id);
CREATE INDEX IF NOT EXISTS idx_analysis_evidence_status ON public.analysis_evidence (verification_status);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) INITIAL POLICIES
-- ============================================================================

ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view analysis runs in their workspaces"
  ON public.analysis_runs FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

CREATE POLICY "Members can view document extractions in their workspaces"
  ON public.document_extractions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

CREATE POLICY "Members can view analysis findings in their workspaces"
  ON public.analysis_findings FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

CREATE POLICY "Members can view analysis evidence in their workspaces"
  ON public.analysis_evidence FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

-- ============================================================================
-- PART 2: 00013_harden_intelligence_rls.sql
-- ============================================================================

-- Drop any obsolete client write policies
DROP POLICY IF EXISTS "Privileged members can insert analysis runs" ON public.analysis_runs;
DROP POLICY IF EXISTS "Privileged members can update analysis runs" ON public.analysis_runs;
DROP POLICY IF EXISTS "Privileged members can insert document extractions" ON public.document_extractions;
DROP POLICY IF EXISTS "Privileged members can insert analysis findings" ON public.analysis_findings;
DROP POLICY IF EXISTS "Privileged members can update analysis findings" ON public.analysis_findings;
DROP POLICY IF EXISTS "Privileged members can insert analysis evidence" ON public.analysis_evidence;

-- Revoke all mutations from client roles (anon, authenticated, public)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_runs FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.document_extractions FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_findings FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.analysis_evidence FROM authenticated, anon, public;

-- Grant SELECT permissions to authenticated members
GRANT SELECT ON public.analysis_runs TO authenticated;
GRANT SELECT ON public.document_extractions TO authenticated;
GRANT SELECT ON public.analysis_findings TO authenticated;
GRANT SELECT ON public.analysis_evidence TO authenticated;

-- Grant exclusive write access to service_role (used by server endpoints)
GRANT ALL ON public.analysis_runs TO service_role;
GRANT ALL ON public.document_extractions TO service_role;
GRANT ALL ON public.analysis_findings TO service_role;
GRANT ALL ON public.analysis_evidence TO service_role;

-- Ensure RLS is active and SELECT policies are scoped strictly to member workspaces
DROP POLICY IF EXISTS "Members can view analysis runs in their workspaces" ON public.analysis_runs;
CREATE POLICY "Members can view analysis runs in their workspaces"
  ON public.analysis_runs FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

DROP POLICY IF EXISTS "Members can view document extractions in their workspaces" ON public.document_extractions;
CREATE POLICY "Members can view document extractions in their workspaces"
  ON public.document_extractions FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

DROP POLICY IF EXISTS "Members can view analysis findings in their workspaces" ON public.analysis_findings;
CREATE POLICY "Members can view analysis findings in their workspaces"
  ON public.analysis_findings FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

DROP POLICY IF EXISTS "Members can view analysis evidence in their workspaces" ON public.analysis_evidence;
CREATE POLICY "Members can view analysis evidence in their workspaces"
  ON public.analysis_evidence FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));
