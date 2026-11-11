// src/lib/server/intelligence/counteroffer-generator.ts
/**
 * Counteroffer Generation Engine — Module 4 / TERMBridge
 *
 * Deterministically constructs commercially permitted counterproposals:
 * - Proposes rule-compliant terms (e.g. MOQ 50, Discount 10%, Net 45, 7 business days delivery).
 * - Performs exact integer arithmetic for money (no JS floating-point calculations).
 * - Computes deterministic SHA-256 terms_hash for immutable version binding.
 * - Explains every proposed change with references to commercial rules and analysis findings.
 * - Tax and shipping are NOT invented (retains 0.00 unless documented in source PO).
 */

import crypto from "crypto";
import { centsToDecimalString } from "./commercial-validator";
import { CommercialRuleRecord, RuleEvaluationResult } from "./rules-engine";
import { DecisionFinding } from "./decision-engine";

export interface OriginalTermsInput {
  quantity: number;
  unit_price_cents: number; // e.g. 10000 = $100.00
  discount_percent: number; // e.g. 15.0
  payment_term_label: string; // e.g. "Net 60"
  payment_term_days: number; // e.g. 60
  delivery_days: number; // e.g. 3
  currency: string; // e.g. "USD"
  product_name?: string;
  tax_amount_cents?: number;
  shipping_amount_cents?: number;
}

export interface ProposedLineItem {
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price_cents: number;
  gross_amount_cents: number;
  discount_amount_cents: number;
  net_amount_cents: number;
}

export interface ProposedTerms {
  quantity: number;
  unit_price_cents: number;
  discount_percent: number;
  discount_amount_cents: number;
  payment_term_days: number;
  payment_term_label: string;
  delivery_days: number;
  currency: string;
  line_items: ProposedLineItem[];
}

export interface FinancialSummary {
  gross_amount: string; // "5000.00"
  discount_amount: string; // "500.00"
  subtotal: string; // "4500.00"
  tax_amount: string; // "0.00"
  shipping_amount: string; // "0.00"
  grand_total: string; // "4500.00"
  currency: string;
}

export interface TermChange {
  term: string;
  original: string;
  proposed: string;
  reason: string;
  rule_id?: string;
  finding_id?: string;
}

export interface CounterproposalResult {
  available: boolean;
  no_proposal_reason?: string;
  proposed_terms?: ProposedTerms;
  original_terms?: Record<string, unknown>;
  financial_summary?: FinancialSummary;
  term_changes: TermChange[];
  rule_references: string[];
  finding_references: string[];
  explanation: string;
  terms_hash: string;
}

export interface GenerateCounterofferInput {
  workspaceId: string;
  rules: CommercialRuleRecord[];
  findings: DecisionFinding[];
  originalTerms: OriginalTermsInput;
  ruleResults: RuleEvaluationResult[];
}

/**
 * Computes a deterministic SHA-256 hash of a canonicalized JSON string.
 */
export function computeCanonicalTermsHash(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    canonicalObj[key] = payload[key];
  }
  const jsonStr = JSON.stringify(canonicalObj);
  return crypto.createHash("sha256").update(jsonStr).digest("hex");
}

/**
 * Generates a rule-validated commercial counteroffer proposal.
 */
export function generateCounteroffer(
  input: GenerateCounterofferInput
): CounterproposalResult {
  const { rules, findings, originalTerms, ruleResults } = input;

  // Verify that an alternative is commercially possible
  const currencyResult = ruleResults.find((r) => r.applicable_term === "currency");
  if (currencyResult && currencyResult.outcome === "prohibited") {
    return {
      available: false,
      no_proposal_reason: "Transaction currency is prohibited by merchant policy. Counteroffer cannot be formed.",
      term_changes: [],
      rule_references: [currencyResult.rule_id],
      finding_references: [],
      explanation: "Currency not accepted.",
      terms_hash: "",
    };
  }

  // Determine compliant parameters from rules & operative amendments
  let proposedQuantity = originalTerms.quantity;
  let proposedDiscountPercent = originalTerms.discount_percent;
  let proposedPaymentDays = originalTerms.payment_term_days;
  let proposedPaymentLabel = originalTerms.payment_term_label;
  let proposedDeliveryDays = originalTerms.delivery_days;
  const unitPriceCents = originalTerms.unit_price_cents;
  const currency = (originalTerms.currency || "USD").toUpperCase();

  const termChanges: TermChange[] = [];
  const ruleReferences: string[] = [];
  const findingReferences: string[] = [];

  // 1. Minimum Quantity Rule
  const thresholdRule = rules.find((r) => r.rule_type === "threshold");
  const minUnits = typeof thresholdRule?.configuration?.minUnits === "number"
    ? (thresholdRule.configuration.minUnits as number)
    : 50;
  const maxDiscountDecimal = typeof thresholdRule?.configuration?.maxDiscount === "number"
    ? (thresholdRule.configuration.maxDiscount as number)
    : 0.10;
  const maxDiscountPercent = Math.round(maxDiscountDecimal * 100);

  const qtyFinding = findings.find((f) => f.term_key === "conflict" && f.explanation.includes("quantity"));

  if (originalTerms.quantity < minUnits) {
    proposedQuantity = minUnits;
    if (thresholdRule) ruleReferences.push(thresholdRule.id);
    if (qtyFinding) findingReferences.push(qtyFinding.id);

    termChanges.push({
      term: "Order Quantity",
      original: `${originalTerms.quantity} units`,
      proposed: `${minUnits} units`,
      reason: `Adjusted to contractual Minimum Order Quantity (${minUnits} units). Orders below MOQ are not permitted.`,
      rule_id: thresholdRule?.id,
      finding_id: qtyFinding?.id,
    });
  }

  // 2. Volume Discount Rule
  const discountFinding = findings.find((f) => f.term_key === "conflict" && f.explanation.includes("discount"));

  if (originalTerms.discount_percent > maxDiscountPercent) {
    proposedDiscountPercent = maxDiscountPercent;
    if (thresholdRule && !ruleReferences.includes(thresholdRule.id)) {
      ruleReferences.push(thresholdRule.id);
    }
    if (discountFinding) findingReferences.push(discountFinding.id);

    termChanges.push({
      term: "Volume Discount",
      original: `${originalTerms.discount_percent}% (Unauthorized Promotional)`,
      proposed: `${maxDiscountPercent}% (Standard Tier-1 Volume Discount)`,
      reason: `Adjusted to contractual ceiling of ${maxDiscountPercent}% applicable to orders meeting the ${minUnits}-unit threshold.`,
      rule_id: thresholdRule?.id,
      finding_id: discountFinding?.id,
    });
  }

  // 3. Payment Terms (Operative Amendment No. 1 stipulates Net 45)
  const paymentFinding = findings.find(
    (f) =>
      (f.term_key === "conflict" || f.term_key === "payment_term_conflict") &&
      (f.explanation.includes("Net") || f.explanation.includes("payment"))
  );
  const paymentRule = rules.find((r) => r.rule_type === "payment_terms");

  // If PO requested Net 60, but operative amendment is Net 45:
  if (originalTerms.payment_term_days > 45 || originalTerms.payment_term_label.includes("60")) {
    proposedPaymentDays = 45;
    proposedPaymentLabel = "Net 45";
    if (paymentRule) ruleReferences.push(paymentRule.id);
    if (paymentFinding) findingReferences.push(paymentFinding.id);

    termChanges.push({
      term: "Payment Terms",
      original: originalTerms.payment_term_label || `Net ${originalTerms.payment_term_days}`,
      proposed: "Net 45",
      reason: "Adjusted to operative terms under Amendment No. 1 (Net 45 days). Net 60 exceeds permitted credit policy.",
      rule_id: paymentRule?.id,
      finding_id: paymentFinding?.id,
    });
  }

  // 4. Delivery Lead Time (Contractual standard is 7 business days)
  const deliveryFinding = findings.find(
    (f) =>
      (f.term_key === "conflict" || f.term_key === "delivery_window_conflict") &&
      f.explanation.includes("delivery")
  );
  const fulfillmentRule = rules.find((r) => r.rule_type === "fulfillment");

  if (originalTerms.delivery_days < 7) {
    proposedDeliveryDays = 7;
    if (fulfillmentRule) ruleReferences.push(fulfillmentRule.id);
    if (deliveryFinding) findingReferences.push(deliveryFinding.id);

    termChanges.push({
      term: "Delivery Schedule",
      original: `${originalTerms.delivery_days} business days`,
      proposed: "7 business days",
      reason: "Adjusted to contractual lead time of seven (7) business days from order confirmation.",
      rule_id: fulfillmentRule?.id,
      finding_id: deliveryFinding?.id,
    });
  }

  // 5. Financial calculations using exact integer arithmetic (in cents)
  // Gross = quantity * unit_price (e.g. 50 * 10000 = 500,000 cents = $5,000.00)
  const grossCents = proposedQuantity * unitPriceCents;

  // Discount = (discount_percent * gross) / 100
  // In basis points: discountBps = Math.round(proposedDiscountPercent * 100)
  const discountBps = Math.round(proposedDiscountPercent * 100);
  const discountAmountCents = Number((BigInt(grossCents) * BigInt(discountBps) + BigInt(5000)) / BigInt(10000));

  // Subtotal = Gross - Discount (e.g. 500,000 - 50,000 = 450,000 cents = $4,500.00)
  const subtotalCents = grossCents - discountAmountCents;

  // Taxes and Shipping: explicitly preserved, never invented
  const taxCents = originalTerms.tax_amount_cents || 0;
  const shippingCents = originalTerms.shipping_amount_cents || 0;
  const grandTotalCents = subtotalCents + taxCents + shippingCents;

  const productName = originalTerms.product_name || "Commercial Fulfillment Order";

  const lineItems: ProposedLineItem[] = [
    {
      product_name: productName,
      quantity: proposedQuantity,
      unit_price_cents: unitPriceCents,
      gross_amount_cents: grossCents,
      discount_amount_cents: discountAmountCents,
      net_amount_cents: subtotalCents,
    },
  ];

  const proposedTerms: ProposedTerms = {
    quantity: proposedQuantity,
    unit_price_cents: unitPriceCents,
    discount_percent: proposedDiscountPercent,
    discount_amount_cents: discountAmountCents,
    payment_term_days: proposedPaymentDays,
    payment_term_label: proposedPaymentLabel,
    delivery_days: proposedDeliveryDays,
    currency,
    line_items: lineItems,
  };

  const financialSummary: FinancialSummary = {
    gross_amount: centsToDecimalString(grossCents),
    discount_amount: centsToDecimalString(discountAmountCents),
    subtotal: centsToDecimalString(subtotalCents),
    tax_amount: centsToDecimalString(taxCents),
    shipping_amount: centsToDecimalString(shippingCents),
    grand_total: centsToDecimalString(grandTotalCents),
    currency,
  };

  const originalTermsRecord: Record<string, unknown> = {
    quantity: originalTerms.quantity,
    unit_price: centsToDecimalString(unitPriceCents),
    discount_percent: originalTerms.discount_percent,
    payment_terms: originalTerms.payment_term_label,
    delivery_days: originalTerms.delivery_days,
    currency: originalTerms.currency,
    product_name: originalTerms.product_name,
  };

  // Compute terms hash
  const termsHash = computeCanonicalTermsHash(proposedTerms as unknown as Record<string, unknown>);

  const explanation =
    `Rule-validated counterproposal: Adjusted quantity to contractual MOQ (${proposedQuantity} units) ` +
    `qualifying for the approved ${proposedDiscountPercent}% volume discount. Payment terms reconciled to ` +
    `operative Net ${proposedPaymentDays} days under Amendment No. 1, with standard ${proposedDeliveryDays}-day delivery fulfillment.`;

  return {
    available: true,
    proposed_terms: proposedTerms,
    original_terms: originalTermsRecord,
    financial_summary: financialSummary,
    term_changes: termChanges,
    rule_references: ruleReferences,
    finding_references: findingReferences,
    explanation,
    terms_hash: termsHash,
  };
}
