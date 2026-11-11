// src/lib/server/intelligence/rules-engine.ts
/**
 * Deterministic Commercial Rules Engine — Module 4 / TERMBridge
 *
 * Evaluates a Purchase Order against loaded commercial rules using
 * exact integer arithmetic (no floating-point money comparisons).
 */

import {
  calculatePaymentTermVarianceDays,
  CURRENCY_CONFIGS,
} from "@/lib/server/intelligence/commercial-validator";

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface RuleEvaluationInput {
  /** e.g. 45 */
  quantity: number;
  /** Integer cents, e.g. 10000 = $100.00 */
  unitPrice: number;
  /** Discount as a percentage value, e.g. 15.0 means 15% */
  discountPercent: number;
  /** e.g. 60 for Net 60 */
  paymentTermDays: number;
  /** Business days for delivery, e.g. 3 */
  deliveryDays: number;
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /** Total transaction value in minor units (cents), e.g. 450000 */
  transactionValueCents: number;
  /** Maps term key → analysis finding UUID for cross-reference */
  findingIds?: Record<string, string>;
}

export type RuleOutcome =
  | "permitted"
  | "prohibited"
  | "requires_approval"
  | "ambiguous"
  | "missing_rule";

export interface RuleEvaluationResult {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  applicable_term: string;
  observed_value: string;
  allowed_value: string;
  outcome: RuleOutcome;
  explanation: string;
  source_analysis_finding_id?: string;
  requires_approval_reason?: string;
}

export interface CommercialRuleRecord {
  id: string;
  name: string;
  rule_type: string;
  configuration: Record<string, unknown>;
  priority: number;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Helper: extract integer days from payment terms string (e.g. "Net 30" → 30)
// ---------------------------------------------------------------------------

function parseNetDays(termStr: string | null | undefined): number | undefined {
  if (!termStr) return undefined;
  const match = termStr.match(/(?:net|within|\b)(\d+)\s*(?:days?|d)?/i);
  return match ? parseInt(match[1], 10) : undefined;
}

// ---------------------------------------------------------------------------
// Rule Evaluators
// ---------------------------------------------------------------------------

function evaluateThreshold(
  rule: CommercialRuleRecord,
  input: RuleEvaluationInput
): RuleEvaluationResult[] {
  const results: RuleEvaluationResult[] = [];
  const cfg = rule.configuration || {};
  const minUnits = typeof cfg["minUnits"] === "number" ? (cfg["minUnits"] as number) : 0;
  const maxDiscount =
    typeof cfg["maxDiscount"] === "number" ? (cfg["maxDiscount"] as number) : 1;
  const requiresApproval = cfg["requiresApproval"] === true;

  // 1. Quantity check
  if (minUnits > 0) {
    const qtyPassed = input.quantity >= minUnits;
    const qtyOutcome: RuleOutcome = qtyPassed
      ? "permitted"
      : requiresApproval
      ? "requires_approval"
      : "prohibited";

    results.push({
      rule_id: rule.id,
      rule_name: `${rule.name} (Quantity)`,
      rule_type: rule.rule_type,
      applicable_term: "quantity",
      observed_value: `${input.quantity} units`,
      allowed_value: `>= ${minUnits} units`,
      outcome: qtyOutcome,
      explanation: qtyPassed
        ? `Order quantity of ${input.quantity} units satisfies minimum order threshold of ${minUnits} units.`
        : `Quantity ${input.quantity} is below the minimum order quantity of ${minUnits} units.`,
      source_analysis_finding_id: input.findingIds?.["quantity"] || input.findingIds?.["conflict"],
      requires_approval_reason:
        qtyOutcome === "requires_approval"
          ? `Quantity ${input.quantity} < MOQ ${minUnits}; manual override required.`
          : undefined,
    });
  }

  // 2. Discount check (using integer basis points)
  const observedDiscountBps = Math.round(input.discountPercent * 100);
  const maxDiscountBps = Math.round(maxDiscount * 10000);
  const discountPassed = observedDiscountBps <= maxDiscountBps;

  results.push({
    rule_id: rule.id,
    rule_name: `${rule.name} (Discount)`,
    rule_type: rule.rule_type,
    applicable_term: "discount",
    observed_value: `${input.discountPercent}%`,
    allowed_value: `<= ${maxDiscount * 100}%`,
    outcome: discountPassed ? "permitted" : "prohibited",
    explanation: discountPassed
      ? `Discount of ${input.discountPercent}% (${observedDiscountBps} bps) is within permitted maximum of ${maxDiscount * 100}%.`
      : `Discount of ${input.discountPercent}% (${observedDiscountBps} bps) exceeds the maximum permitted discount of ${maxDiscount * 100}% (${maxDiscountBps} bps).`,
    source_analysis_finding_id: input.findingIds?.["discount"] || input.findingIds?.["conflict"],
  });

  return results;
}

function evaluatePaymentTerms(
  rule: CommercialRuleRecord,
  input: RuleEvaluationInput
): RuleEvaluationResult {
  const cfg = rule.configuration || {};
  const defaultTerms = typeof cfg["defaultTerms"] === "string" ? (cfg["defaultTerms"] as string) : "Net 30";

  const { contractDays } = calculatePaymentTermVarianceDays(defaultTerms, `Net ${input.paymentTermDays}`);
  const contractDaysResolved = contractDays ?? 30;

  if (input.paymentTermDays > contractDaysResolved) {
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      rule_type: rule.rule_type,
      applicable_term: "payment_terms",
      observed_value: `Net ${input.paymentTermDays}`,
      allowed_value: defaultTerms,
      outcome: "requires_approval",
      explanation: `Requested payment term of Net ${input.paymentTermDays} exceeds standard term of ${defaultTerms} (${contractDaysResolved} days). Credit approval required.`,
      source_analysis_finding_id: input.findingIds?.["payment_terms"] || input.findingIds?.["conflict"],
      requires_approval_reason: `Payment term Net ${input.paymentTermDays} exceeds standard ${defaultTerms}; credit approval required.`,
    };
  }

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    applicable_term: "payment_terms",
    observed_value: `Net ${input.paymentTermDays}`,
    allowed_value: defaultTerms,
    outcome: "permitted",
    explanation: `Payment term Net ${input.paymentTermDays} is within standard term of ${defaultTerms}.`,
    source_analysis_finding_id: input.findingIds?.["payment_terms"] || input.findingIds?.["conflict"],
  };
}

function evaluateFulfillment(
  rule: CommercialRuleRecord,
  input: RuleEvaluationInput
): RuleEvaluationResult {
  const cfg = rule.configuration || {};
  const minDays = typeof cfg["minDays"] === "number" ? (cfg["minDays"] as number) : 5;
  const surcharge = typeof cfg["surcharge"] === "number" ? (cfg["surcharge"] as number) : 0;

  if (input.deliveryDays < minDays) {
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      rule_type: rule.rule_type,
      applicable_term: "fulfillment",
      observed_value: `${input.deliveryDays} business days`,
      allowed_value: `>= ${minDays} business days`,
      outcome: "requires_approval",
      explanation: `Requested delivery in ${input.deliveryDays} business days is shorter than the minimum fulfillment lead time of ${minDays} days. Expedited processing requires operational approval${surcharge > 0 ? ` (surcharge: $${surcharge})` : ""}.`,
      source_analysis_finding_id: input.findingIds?.["delivery_days"] || input.findingIds?.["conflict"],
      requires_approval_reason: `Delivery in ${input.deliveryDays} business days is below standard lead time of ${minDays} days. Expedited approval required.`,
    };
  }

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    applicable_term: "fulfillment",
    observed_value: `${input.deliveryDays} business days`,
    allowed_value: `>= ${minDays} business days`,
    outcome: "permitted",
    explanation: `Delivery window of ${input.deliveryDays} business days meets minimum fulfillment lead time of ${minDays} days.`,
    source_analysis_finding_id: input.findingIds?.["delivery_days"] || input.findingIds?.["conflict"],
  };
}

function evaluateGate(
  rule: CommercialRuleRecord
): RuleEvaluationResult {
  const cfg = rule.configuration || {};
  const gateCondition = typeof cfg["gateCondition"] === "string" ? (cfg["gateCondition"] as string) : "all_terms_approved";

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    applicable_term: "gate",
    observed_value: "pre-finalization",
    allowed_value: gateCondition,
    outcome: "ambiguous",
    explanation: `Commercial gate "${rule.name}" condition "${gateCondition}" cannot be resolved until finalization. All terms must be approved prior to invoicing.`,
  };
}

function evaluateDiscount(
  rule: CommercialRuleRecord,
  input: RuleEvaluationInput
): RuleEvaluationResult {
  const cfg = rule.configuration || {};
  const maxDiscount = typeof cfg["maxDiscount"] === "number" ? (cfg["maxDiscount"] as number) : 0.1;

  const observedDiscountBps = Math.round(input.discountPercent * 100);
  const maxDiscountBps = Math.round(maxDiscount * 10000);

  if (observedDiscountBps > maxDiscountBps) {
    return {
      rule_id: rule.id,
      rule_name: rule.name,
      rule_type: rule.rule_type,
      applicable_term: "discount",
      observed_value: `${input.discountPercent}%`,
      allowed_value: `<= ${maxDiscount * 100}%`,
      outcome: "prohibited",
      explanation: `Discount of ${input.discountPercent}% exceeds maximum permitted discount of ${maxDiscount * 100}%.`,
      source_analysis_finding_id: input.findingIds?.["discount"],
    };
  }

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    rule_type: rule.rule_type,
    applicable_term: "discount",
    observed_value: `${input.discountPercent}%`,
    allowed_value: `<= ${maxDiscount * 100}%`,
    outcome: "permitted",
    explanation: `Discount of ${input.discountPercent}% is within maximum permitted discount of ${maxDiscount * 100}%.`,
    source_analysis_finding_id: input.findingIds?.["discount"],
  };
}

// ---------------------------------------------------------------------------
// Main Evaluation Function
// ---------------------------------------------------------------------------

export function evaluateRules(
  rules: CommercialRuleRecord[],
  input: RuleEvaluationInput
): RuleEvaluationResult[] {
  const results: RuleEvaluationResult[] = [];

  const activeRules = rules.filter((r) => r.is_active !== false);

  if (activeRules.length === 0) {
    results.push({
      rule_id: "missing-rule-set",
      rule_name: "Merchant Rule Set",
      rule_type: "general",
      applicable_term: "general_compliance",
      observed_value: "No active rules found",
      allowed_value: "Active commercial rules required",
      outcome: "missing_rule",
      explanation: "No active commercial rules configured for this workspace. Merchant policy requires defined rules for approval.",
    });
    return results;
  }

  // Sort by priority ascending
  const sorted = [...activeRules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    switch (rule.rule_type) {
      case "threshold": {
        const thresholdResults = evaluateThreshold(rule, input);
        results.push(...thresholdResults);
        break;
      }

      case "payment_terms":
        results.push(evaluatePaymentTerms(rule, input));
        break;

      case "fulfillment":
        results.push(evaluateFulfillment(rule, input));
        break;

      case "gate":
        results.push(evaluateGate(rule));
        break;

      case "discount":
        results.push(evaluateDiscount(rule, input));
        break;

      case "general":
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.rule_type,
          applicable_term: "general",
          observed_value: "n/a",
          allowed_value: "n/a",
          outcome: "ambiguous",
          explanation: `General rule "${rule.name}" does not map to a specific term evaluator. Manual review required.`,
        });
        break;

      default:
        results.push({
          rule_id: rule.id,
          rule_name: rule.name,
          rule_type: rule.rule_type,
          applicable_term: "unknown",
          observed_value: "n/a",
          allowed_value: "n/a",
          outcome: "missing_rule",
          explanation: `Unknown rule type "${rule.rule_type}" for rule "${rule.name}". No evaluator is registered for this type.`,
        });
        break;
    }
  }

  // Currency validation check (deterministic)
  const normCurrency = (input.currency || "").toUpperCase().trim();
  const isSupportedCurrency = !!CURRENCY_CONFIGS[normCurrency];
  if (!isSupportedCurrency) {
    results.push({
      rule_id: "currency-restriction-rule",
      rule_name: "Currency Acceptance Policy",
      rule_type: "currency",
      applicable_term: "currency",
      observed_value: input.currency,
      allowed_value: "Supported currencies (USD, EUR, GBP, CAD, AUD, JPY)",
      outcome: "prohibited",
      explanation: `Currency '${input.currency}' is not supported by the merchant's commercial invoicing system.`,
    });
  }

  return results;
}

export { parseNetDays };
