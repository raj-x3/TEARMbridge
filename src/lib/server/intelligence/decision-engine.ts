// src/lib/server/intelligence/decision-engine.ts
/**
 * Commercial Decision Engine — Module 4 / TERMBridge
 *
 * Consumes:
 * - Agreement ID
 * - Purchase Order ID
 * - Completed Analysis Run ID
 * - Analysis Findings (Gemini 3.8 Flash reconciled)
 * - Merchant Commercial Rules
 * - Extracted Rule Inputs
 *
 * Classifies commercial viability:
 * - ready_without_changes
 * - requires_counteroffer
 * - requires_internal_approval
 * - blocked
 * - needs_more_information
 *
 * Does NOT permit LLMs to decide financial amounts or override rules.
 */

import {
  evaluateRules,
  CommercialRuleRecord,
  RuleEvaluationInput,
  RuleEvaluationResult,
} from "./rules-engine";

export type DecisionStatus =
  | "ready_without_changes"
  | "requires_counteroffer"
  | "requires_internal_approval"
  | "blocked"
  | "needs_more_information";

export interface DecisionFinding {
  id: string;
  term_key: string;
  finding_type: string;
  severity: string;
  explanation: string;
  review_status?: string | null;
}

export interface CommercialDecisionInput {
  workspaceId: string;
  agreementId: string;
  purchaseOrderId?: string | null;
  analysisRunId: string;
  findings: DecisionFinding[];
  rules: CommercialRuleRecord[];
  ruleInput: RuleEvaluationInput;
}

export interface CommercialDecisionOutput {
  decision_status: DecisionStatus;
  evaluation_results: RuleEvaluationResult[];
  applicable_rule_versions: Array<{
    rule_id: string;
    rule_name: string;
    rule_type: string;
    priority: number;
  }>;
  summary: string;
  blocked_reasons: string[];
  requires_counteroffer_reasons: string[];
  requires_approval_reasons: string[];
  critical_findings: string[];
}

/**
 * Deterministically evaluates commercial feasibility and determines workflow state.
 */
export function evaluateDecision(
  input: CommercialDecisionInput
): CommercialDecisionOutput {
  const { findings, rules, ruleInput } = input;

  // 1. Evaluate commercial rules
  const evaluationResults = evaluateRules(rules, ruleInput);

  // 2. Map applicable rule versions
  const applicableRuleVersions = rules.map((r) => ({
    rule_id: r.id,
    rule_name: r.name,
    rule_type: r.rule_type,
    priority: r.priority,
  }));

  const blockedReasons: string[] = [];
  const counterofferReasons: string[] = [];
  const approvalReasons: string[] = [];
  const criticalFindings: string[] = [];

  // Check currency rule
  const currencyResult = evaluationResults.find((r) => r.applicable_term === "currency");
  if (currencyResult && currencyResult.outcome === "prohibited") {
    blockedReasons.push(currencyResult.explanation);
  }

  // Check findings for critical / ambiguous
  for (const finding of findings) {
    if (finding.finding_type === "ambiguous" || finding.term_key === "ambiguous_amendment") {
      blockedReasons.push(`Ambiguous contractual amendment: ${finding.explanation}`);
    }

    if (
      finding.severity === "critical" &&
      finding.finding_type !== "matched"
    ) {
      criticalFindings.push(`[${finding.term_key}] ${finding.explanation}`);
    }
  }

  // Evaluate rule outcomes
  for (const res of evaluationResults) {
    if (res.outcome === "prohibited") {
      // If quantity or discount is prohibited, a counteroffer can propose compliant terms
      if (
        res.applicable_term === "minimum_order_quantity" ||
        res.applicable_term === "volume_discount" ||
        res.applicable_term === "discount_limit"
      ) {
        counterofferReasons.push(`${res.rule_name}: ${res.explanation}`);
      } else {
        blockedReasons.push(`${res.rule_name}: ${res.explanation}`);
      }
    } else if (res.outcome === "requires_approval") {
      approvalReasons.push(
        res.requires_approval_reason || `${res.rule_name}: ${res.explanation}`
      );
      // Payment term & delivery conflicts also require counteroffer adjustments
      counterofferReasons.push(`${res.rule_name}: ${res.explanation}`);
    }
  }

  // Determine overall status
  let decisionStatus: DecisionStatus = "ready_without_changes";
  let summary = "All commercial terms comply with contractual agreements and merchant policies.";

  if (findings.some((f) => f.term_key === "ambiguous_amendment" || f.finding_type === "ambiguous")) {
    decisionStatus = "needs_more_information";
    summary = "Unresolved ambiguous contract amendments require legal or commercial clarification before proceeding.";
  } else if (blockedReasons.length > 0 && counterofferReasons.length === 0) {
    decisionStatus = "blocked";
    summary = `Transaction blocked by commercial policy: ${blockedReasons.join("; ")}`;
  } else if (counterofferReasons.length > 0) {
    decisionStatus = "requires_counteroffer";
    summary = `Transaction requires structured counteroffer: ${counterofferReasons.length} commercial term(s) deviate from standard policy (MOQ, discount, payment terms, or delivery).`;
  } else if (approvalReasons.length > 0) {
    decisionStatus = "requires_internal_approval";
    summary = `Transaction terms require internal merchant authorization: ${approvalReasons.join("; ")}`;
  }

  return {
    decision_status: decisionStatus,
    evaluation_results: evaluationResults,
    applicable_rule_versions: applicableRuleVersions,
    summary,
    blocked_reasons: blockedReasons,
    requires_counteroffer_reasons: counterofferReasons,
    requires_approval_reasons: approvalReasons,
    critical_findings: criticalFindings,
  };
}
