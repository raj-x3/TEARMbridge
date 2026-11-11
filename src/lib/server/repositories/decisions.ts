// src/lib/server/repositories/decisions.ts
/**
 * Decision & Counteroffer Repository — Module 4 / TERMBridge
 *
 * Provides database access for commercial decisions, counteroffers,
 * versions, approvals, tokens, and finalized transactions.
 * All mutations use createAdminClient() for server-controlled integrity.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface SaveDecisionParams {
  workspaceId: string;
  agreementId: string;
  purchaseOrderId?: string | null;
  analysisRunId?: string | null;
  decisionStatus: string;
  evaluationResults: unknown[];
  applicableRuleVersions: unknown[];
  evaluatedBy?: string | null;
}

export interface SaveCounterofferParams {
  workspaceId: string;
  decisionId: string;
  agreementId: string;
  purchaseOrderId?: string | null;
  buyerId?: string | null;
  supplierId?: string | null;
  currency: string;
  proposedTerms: Record<string, unknown>;
  originalTerms: Record<string, unknown>;
  financialSummary: Record<string, unknown>;
  termsHash: string;
  explanation: string;
  termChanges?: unknown[];
  createdBy?: string | null;
  expiresAt?: string | null;
}

/**
 * Retrieves the latest commercial decision for an agreement.
 */
export async function getDecisionForAgreement(
  workspaceId: string,
  agreementId: string
) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("commercial_decisions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("agreement_id", agreementId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch commercial decision: ${error.message}`);
  }
  return data;
}

/**
 * Saves a new commercial decision using the trusted admin client.
 */
export async function saveDecision(params: SaveDecisionParams): Promise<string> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("commercial_decisions")
    .insert({
      workspace_id: params.workspaceId,
      agreement_id: params.agreementId,
      purchase_order_id: params.purchaseOrderId || null,
      analysis_run_id: params.analysisRunId || null,
      decision_status: params.decisionStatus,
      evaluation_results: params.evaluationResults,
      applicable_rule_versions: params.applicableRuleVersions,
      evaluated_by: params.evaluatedBy || null,
      evaluated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save commercial decision: ${error?.message || "Unknown error"}`);
  }

  // Safe audit logging
  await recordModule4Audit(
    params.workspaceId,
    "commercial_decision",
    data.id,
    "commercial_decision.evaluated",
    {
      decision_status: params.decisionStatus,
      agreement_id: params.agreementId,
      purchase_order_id: params.purchaseOrderId,
    }
  );

  return data.id;
}

/**
 * Retrieves a counteroffer by ID including its current version and approvals.
 */
export async function getCounterofferById(
  workspaceId: string,
  counterofferId: string
) {
  const adminClient = createAdminClient();
  const { data: counteroffer, error: coError } = await adminClient
    .from("counteroffers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", counterofferId)
    .single();

  if (coError || !counteroffer) {
    return null;
  }

  // Fetch current version
  const { data: versions } = await adminClient
    .from("counteroffer_versions")
    .select("*")
    .eq("counteroffer_id", counterofferId)
    .order("version_number", { ascending: false });

  // Fetch approvals
  const { data: approvals } = await adminClient
    .from("counteroffer_approvals")
    .select("*")
    .eq("counteroffer_id", counterofferId)
    .order("created_at", { ascending: true });

  const currentVersion = versions && versions.length > 0 ? versions[0] : null;

  return {
    ...counteroffer,
    current_version_record: currentVersion,
    versions: versions || [],
    approvals: approvals || [],
  };
}

/**
 * Retrieves the latest counteroffer for a commercial decision.
 */
export async function getLatestCounterofferForDecision(
  workspaceId: string,
  decisionId: string
) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("counteroffers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("commercial_decision_id", decisionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return getCounterofferById(workspaceId, data.id);
}

/**
 * Creates a counteroffer and its first immutable version.
 */
export async function saveCounteroffer(
  params: SaveCounterofferParams
): Promise<{ counterofferId: string; versionId: string }> {
  const adminClient = createAdminClient();

  // Expiry defaults to 72 hours from now
  const expiresAt =
    params.expiresAt || new Date(Date.now() + 72 * 3600 * 1000).toISOString();

  // 1. Insert counteroffer parent
  const { data: co, error: coError } = await adminClient
    .from("counteroffers")
    .insert({
      workspace_id: params.workspaceId,
      commercial_decision_id: params.decisionId,
      agreement_id: params.agreementId,
      purchase_order_id: params.purchaseOrderId || null,
      buyer_id: params.buyerId || null,
      supplier_id: params.supplierId || null,
      status: "seller_review",
      current_version: 1,
      currency: params.currency,
      expires_at: expiresAt,
      created_by: params.createdBy || null,
    })
    .select("id")
    .single();

  if (coError || !co) {
    throw new Error(`Failed to create counteroffer: ${coError?.message || "Unknown error"}`);
  }

  // 2. Insert immutable version 1
  const { data: ver, error: verError } = await adminClient
    .from("counteroffer_versions")
    .insert({
      workspace_id: params.workspaceId,
      counteroffer_id: co.id,
      version_number: 1,
      proposed_terms: params.proposedTerms,
      original_terms: params.originalTerms,
      financial_summary: params.financialSummary,
      terms_hash: params.termsHash,
      explanation: params.explanation,
      created_by: params.createdBy || null,
    })
    .select("id")
    .single();

  if (verError || !ver) {
    throw new Error(`Failed to create counteroffer version: ${verError?.message || "Unknown error"}`);
  }

  // Safe audit logging
  await recordModule4Audit(
    params.workspaceId,
    "counteroffer",
    co.id,
    "counteroffer.created",
    {
      version_id: ver.id,
      version_number: 1,
      terms_hash: params.termsHash,
    }
  );

  return { counterofferId: co.id, versionId: ver.id };
}

/**
 * Retrieves a finalized transaction by ID.
 */
export async function getFinalizedTransaction(
  workspaceId: string,
  transactionId: string
) {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("finalized_transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", transactionId)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Safe audit event logger for Module 4.
 * Uses service role to insert into audit_events directly.
 */
export async function recordModule4Audit(
  workspaceId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("audit_events").insert({
      workspace_id: workspaceId,
      actor_type: "system",
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      details,
    });
  } catch (err) {
    console.warn(`[Audit Warning] Failed to append audit event for ${eventType}:`, err);
  }
}
