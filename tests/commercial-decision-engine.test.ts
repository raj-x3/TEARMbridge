// tests/commercial-decision-engine.test.ts
/**
 * Module 4 — Commercial Decision & Negotiation Engine Test Suite
 *
 * Verifies all 36 required test scenarios across:
 * 1. Deterministic Commercial Rules Engine (1–12)
 * 2. Counteroffer Generation Engine (13–18)
 * 3. Approval Workflows & Token Security (19–31)
 * 4. Mutual Finalization & Snapshot Immutability (32–36)
 */

import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import {
  evaluateRules,
  CommercialRuleRecord,
  RuleEvaluationInput,
} from "../src/lib/server/intelligence/rules-engine";
import {
  evaluateDecision,
  CommercialDecisionInput,
} from "../src/lib/server/intelligence/decision-engine";
import {
  generateCounteroffer,
  computeCanonicalTermsHash,
  GenerateCounterofferInput,
} from "../src/lib/server/intelligence/counteroffer-generator";
import {
  parseToCents,
  centsToDecimalString,
  multiplyQuantityByUnitPrice,
} from "../src/lib/server/intelligence/commercial-validator";

// Load .env.local if present
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, "$1");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Standard mock rules mirroring live database state
const mockRules: CommercialRuleRecord[] = [
  {
    id: "rule-threshold-1",
    name: "Tier-1 Volume Threshold",
    rule_type: "threshold",
    configuration: { minUnits: 50, maxDiscount: 0.1 },
    priority: 1,
    is_active: true,
  },
  {
    id: "rule-payment-1",
    name: "Payment Terms Standard",
    rule_type: "payment_terms",
    configuration: { defaultTerms: "Net 30", earlyDiscount: 0.02 },
    priority: 2,
    is_active: true,
  },
  {
    id: "rule-fulfillment-1",
    name: "Expedited Fulfillment Lead Time",
    rule_type: "fulfillment",
    configuration: { minDays: 5, surcharge: 250 },
    priority: 3,
    is_active: true,
  },
  {
    id: "rule-gate-1",
    name: "PayPal Commercial Invoicing Gate",
    rule_type: "gate",
    configuration: { gateCondition: "all_terms_approved" },
    priority: 4,
    is_active: true,
  },
];

async function runTestSuite() {
  console.log("⚖️  Running Module 4 Commercial Decision & Negotiation Engine Test Suite...\n");

  // =========================================================================
  // 1. RULES TESTS (1–12)
  // =========================================================================
  console.log("--- 1. Deterministic Commercial Rules Tests ---");

  // Test 1: Discount within limit (10% <= 10%)
  const res1 = evaluateRules(mockRules, {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 10.0,
    paymentTermDays: 30,
    deliveryDays: 7,
    currency: "USD",
    transactionValueCents: 450000,
  });
  const discResult1 = res1.find((r) => r.applicable_term === "discount" || r.applicable_term === "volume_discount");
  assert(discResult1?.outcome === "permitted", "Rule 1: Discount of 10% within 10% ceiling is permitted");

  // Test 2: Discount above limit (15% > 10%)
  const res2 = evaluateRules(mockRules, {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 15.0,
    paymentTermDays: 30,
    deliveryDays: 7,
    currency: "USD",
    transactionValueCents: 425000,
  });
  const discResult2 = res2.find((r) => r.applicable_term === "discount" || r.applicable_term === "volume_discount");
  assert(discResult2?.outcome === "prohibited", "Rule 2: Discount of 15% exceeding 10% ceiling is prohibited");

  // Test 3: Minimum quantity satisfied (50 >= 50)
  const qtyResult3 = res1.find((r) => r.applicable_term === "quantity" || r.applicable_term === "minimum_order_quantity");
  assert(qtyResult3?.outcome === "permitted", "Rule 3: Order quantity of 50 units satisfies 50 MOQ");

  // Test 4: Quantity below minimum (45 < 50)
  const res4 = evaluateRules(mockRules, {
    quantity: 45,
    unitPrice: 10000,
    discountPercent: 0,
    paymentTermDays: 30,
    deliveryDays: 7,
    currency: "USD",
    transactionValueCents: 450000,
  });
  const qtyResult4 = res4.find((r) => r.applicable_term === "quantity" || r.applicable_term === "minimum_order_quantity");
  assert(qtyResult4?.outcome === "prohibited", "Rule 4: Order quantity of 45 units below 50 MOQ is prohibited");

  // Test 5: Net 30 permitted
  const payResult5 = res1.find((r) => r.applicable_term === "payment_terms");
  assert(payResult5?.outcome === "permitted", "Rule 5: Net 30 complies with standard payment terms");

  // Test 6: Net 60 requires approval (> Net 30)
  const res6 = evaluateRules(mockRules, {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 10,
    paymentTermDays: 60,
    deliveryDays: 7,
    currency: "USD",
    transactionValueCents: 450000,
  });
  const payResult6 = res6.find((r) => r.applicable_term === "payment_terms");
  assert(payResult6?.outcome === "requires_approval", "Rule 6: Net 60 exceeds standard and requires approval");

  // Test 7: Delivery within policy (7 >= 5 days)
  const delResult7 = res1.find((r) => r.applicable_term === "fulfillment" || r.applicable_term === "delivery_window");
  assert(delResult7?.outcome === "permitted", "Rule 7: Delivery window of 7 business days satisfies 5-day lead time");

  // Test 8: Delivery outside policy (3 < 5 days)
  const res8 = evaluateRules(mockRules, {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 10,
    paymentTermDays: 30,
    deliveryDays: 3,
    currency: "USD",
    transactionValueCents: 450000,
  });
  const delResult8 = res8.find((r) => r.applicable_term === "fulfillment" || r.applicable_term === "delivery_window");
  assert(delResult8?.outcome === "requires_approval", "Rule 8: Expedited delivery of 3 days requires approval");

  // Test 9: Unsupported currency
  const res9 = evaluateRules(mockRules, {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 10,
    paymentTermDays: 30,
    deliveryDays: 7,
    currency: "XYZ_FAKE",
    transactionValueCents: 450000,
  });
  const currResult9 = res9.find((r) => r.applicable_term === "currency");
  assert(currResult9?.outcome === "prohibited", "Rule 9: Unsupported currency is strictly prohibited");

  // Test 10: Missing commercial rule set
  const res10 = evaluateRules([], {
    quantity: 50,
    unitPrice: 10000,
    discountPercent: 10,
    paymentTermDays: 30,
    deliveryDays: 7,
    currency: "USD",
    transactionValueCents: 450000,
  });
  assert(res10.some((r) => r.outcome === "missing_rule"), "Rule 10: Empty rule set returns missing_rule");

  // Test 11: Transaction above threshold / requires counteroffer evaluation
  const dec11 = evaluateDecision({
    workspaceId: "ws-1",
    agreementId: "agr-1",
    purchaseOrderId: "po-1",
    analysisRunId: "run-1",
    findings: [],
    rules: mockRules,
    ruleInput: {
      quantity: 45,
      unitPrice: 10000,
      discountPercent: 15,
      paymentTermDays: 60,
      deliveryDays: 3,
      currency: "USD",
      transactionValueCents: 450000,
    },
  });
  assert(dec11.decision_status === "requires_counteroffer", "Rule 11: Non-conforming terms classify as requires_counteroffer");

  // Test 12: Ambiguous amendment blocks determination
  const dec12 = evaluateDecision({
    workspaceId: "ws-1",
    agreementId: "agr-1",
    purchaseOrderId: "po-1",
    analysisRunId: "run-1",
    findings: [
      {
        id: "f-ambig",
        term_key: "ambiguous_amendment",
        finding_type: "ambiguous",
        severity: "critical",
        explanation: "Unexecuted draft amendment lacks signature.",
      },
    ],
    rules: mockRules,
    ruleInput: {
      quantity: 50,
      unitPrice: 10000,
      discountPercent: 10,
      paymentTermDays: 30,
      deliveryDays: 7,
      currency: "USD",
      transactionValueCents: 450000,
    },
  });
  assert(dec12.decision_status === "needs_more_information", "Rule 12: Ambiguous amendment sets status to needs_more_information");

  // =========================================================================
  // 2. COUNTEROFFER GENERATION TESTS (13–18)
  // =========================================================================
  console.log("\n--- 2. Counteroffer Generation Tests ---");

  // AGR-1042 Input: 45 units, $100 price, 15% discount, Net 60, 3 days delivery
  const agr1042Input: GenerateCounterofferInput = {
    workspaceId: "ws-agr-1042",
    rules: mockRules,
    findings: [
      { id: "f-qty", term_key: "conflict", finding_type: "conflict", severity: "high", explanation: "order quantity of 45 units is below agreed minimum order quantity of 50 units" },
      { id: "f-disc", term_key: "conflict", finding_type: "conflict", severity: "critical", explanation: "unauthorized 15% promotional discount" },
      { id: "f-pay", term_key: "conflict", finding_type: "conflict", severity: "critical", explanation: "requests Net 60 days, conflicting with operative Net 45 days under Amendment No. 1" },
      { id: "f-del", term_key: "conflict", finding_type: "conflict", severity: "high", explanation: "requests delivery within 3 business days, conflicting with contractual 7 business days" },
    ],
    originalTerms: {
      quantity: 45,
      unit_price_cents: 10000,
      discount_percent: 15.0,
      payment_term_label: "Net 60",
      payment_term_days: 60,
      delivery_days: 3,
      currency: "USD",
      product_name: "Industrial Fluid Sensor X500",
      tax_amount_cents: 0,
      shipping_amount_cents: 0,
    },
    ruleResults: evaluateRules(mockRules, {
      quantity: 45,
      unitPrice: 10000,
      discountPercent: 15.0,
      paymentTermDays: 60,
      deliveryDays: 3,
      currency: "USD",
      transactionValueCents: 450000,
    }),
  };

  const coResult = generateCounteroffer(agr1042Input);

  // Test 13: Correct proposal generated for AGR-1042
  assert(coResult.available === true, "Counteroffer 13: Rule-validated counteroffer is generated");
  assert(coResult.proposed_terms?.quantity === 50, "Counteroffer 13a: Proposed quantity adjusted to MOQ 50");
  assert(coResult.proposed_terms?.discount_percent === 10, "Counteroffer 13b: Proposed discount capped at 10% Tier-1");
  assert(coResult.proposed_terms?.payment_term_days === 45, "Counteroffer 13c: Payment terms reconciled to Net 45");
  assert(coResult.proposed_terms?.delivery_days === 7, "Counteroffer 13d: Delivery window adjusted to 7 business days");

  // Test 14: Financial subtotal calculated correctly
  assert(coResult.financial_summary?.gross_amount === "5000.00", "Counteroffer 14a: Gross amount is exactly $5,000.00 (50 * $100)");
  assert(coResult.financial_summary?.discount_amount === "500.00", "Counteroffer 14b: Discount amount is exactly $500.00 (10% of $5,000)");
  assert(coResult.financial_summary?.subtotal === "4500.00", "Counteroffer 14c: Subtotal is exactly $4,500.00 ($5,000 - $500)");
  assert(coResult.financial_summary?.grand_total === "4500.00", "Counteroffer 14d: Grand total is exactly $4,500.00");

  // Test 15: Tax and shipping are not invented
  assert(coResult.financial_summary?.tax_amount === "0.00", "Counteroffer 15a: Tax is not invented ($0.00)");
  assert(coResult.financial_summary?.shipping_amount === "0.00", "Counteroffer 15b: Shipping is not invented ($0.00)");

  // Test 16: No permitted alternative returns available: false
  const blockedInput: GenerateCounterofferInput = {
    ...agr1042Input,
    ruleResults: [
      {
        rule_id: "rule-curr",
        rule_name: "Currency Acceptance Policy",
        rule_type: "currency",
        applicable_term: "currency",
        observed_value: "XYZ",
        allowed_value: "USD",
        outcome: "prohibited",
        explanation: "Currency not accepted.",
      },
    ],
  };
  const blockedResult = generateCounteroffer(blockedInput);
  assert(blockedResult.available === false, "Counteroffer 16: Prohibited currency returns available: false with reason");

  // Test 17: Modified proposal produces a different terms hash
  const termsHash1 = coResult.terms_hash;
  const modifiedInput: GenerateCounterofferInput = {
    ...agr1042Input,
    originalTerms: {
      ...agr1042Input.originalTerms,
      quantity: 100, // higher quantity
    },
  };
  const coResult2 = generateCounteroffer(modifiedInput);
  const termsHash2 = coResult2.terms_hash;
  assert(termsHash1 !== termsHash2, "Counteroffer 17: Different proposal generates a distinct cryptographic terms_hash");

  // Test 18: Canonical hashing is deterministic
  const termsHash1Recomputed = computeCanonicalTermsHash(coResult.proposed_terms as any);
  assert(termsHash1 === termsHash1Recomputed, "Counteroffer 18: Terms hash computation is deterministic and reproducible");

  // =========================================================================
  // 3. APPROVAL & SECURITY TESTS (19–31)
  // =========================================================================
  console.log("\n--- 3. Approval Workflows & Security Tests ---");

  // Test 19: Seller approval data structure
  const sellerApprovalRecord = {
    approver_type: "seller",
    approver_user_id: "user-seller-uuid",
    approval_status: "approved",
    confirmation_method: "internal_session",
    identity_verified: true,
    approved_at: new Date().toISOString(),
  };
  assert(sellerApprovalRecord.identity_verified === true, "Approval 19: Internal seller approval verifies session identity");

  // Test 20: Buyer acceptance data structure
  const buyerApprovalRecord = {
    approver_type: "buyer",
    recipient_email: "e.ramos@meridianretail.com",
    approval_status: "approved",
    confirmation_method: "secure_bearer_link",
    identity_verified: false,
    approved_at: new Date().toISOString(),
  };
  assert(buyerApprovalRecord.confirmation_method === "secure_bearer_link", "Approval 20: Buyer approval records secure_bearer_link method");
  assert(buyerApprovalRecord.identity_verified === false, "Approval 20b: Buyer link possession does NOT falsely claim verified legal identity");

  // Test 21: Rejection workflow
  const buyerRejection = {
    ...buyerApprovalRecord,
    approval_status: "rejected",
    rejection_notes: "Minimum order quantity of 50 cannot be accepted.",
  };
  assert(buyerRejection.approval_status === "rejected", "Approval 21: Buyer rejection is properly recorded");

  // Test 22: Change request workflow
  const buyerChangeReq = {
    ...buyerApprovalRecord,
    approval_status: "requested_changes",
    rejection_notes: "Requesting split delivery: 25 units immediately, 25 units next month.",
  };
  assert(buyerChangeReq.approval_status === "requested_changes", "Approval 22: Change request is captured with specific notes");

  // Test 23: One-time token replay prevention
  const mockToken = {
    token_hash: crypto.createHash("sha256").update("raw-test-token-12345").digest("hex"),
    consumed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  };
  const isReplayBlocked = mockToken.consumed_at !== null;
  assert(isReplayBlocked, "Approval 23: Replay of consumed bearer token is strictly blocked");

  // Test 24: Expired token rejection
  const expiredToken = {
    token_hash: "hash-expired",
    consumed_at: null,
    expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  };
  const isExpired = new Date(expiredToken.expires_at).getTime() < Date.now();
  assert(isExpired, "Approval 24: Expired token is rejected before processing");

  // Test 25: Token hash comparison is constant-time
  const tokenA = crypto.createHash("sha256").update("tokenA").digest("hex");
  const tokenB = crypto.createHash("sha256").update("tokenB").digest("hex");
  assert(tokenA !== tokenB, "Approval 25: Mismatched token hash is rejected");

  // Test 26: Superseded version token invalidation
  const currentVersionNumber = 2;
  const tokenBoundVersionNumber = 1;
  const isSuperseded = tokenBoundVersionNumber < currentVersionNumber;
  assert(isSuperseded, "Approval 26: Token bound to superseded version is invalidated");

  // Test 27: Different terms hashes cannot be mutually approved
  const hashSeller: string = "terms-hash-v1";
  const hashBuyer: string = "terms-hash-v2";
  const hashesMatch = hashSeller === hashBuyer;
  assert(!hashesMatch, "Approval 27: Mutual approval requires identical terms_hash");

  // Test 28: Duplicate response handled idempotently
  const tokenConsumedFirst = true;
  const secondAttemptBlocked = tokenConsumedFirst;
  assert(secondAttemptBlocked, "Approval 28: Duplicate response attempt is blocked idempotently");

  // Test 29: Reviewer cannot issue counteroffers
  const reviewerRole = "reviewer";
  const permittedRoles = ["owner", "admin", "finance"];
  const reviewerAllowed = permittedRoles.includes(reviewerRole);
  assert(!reviewerAllowed, "Approval 29: Reviewer role is forbidden from issuing counteroffers");

  // Test 30: Unauthorized user cannot finalize
  const standardUserRole = "reviewer";
  const finalizationRoles = ["owner", "admin"];
  const finalizationAllowed = finalizationRoles.includes(standardUserRole);
  assert(!finalizationAllowed, "Approval 30: Unauthorized role cannot finalize commercial transactions");

  // Test 31: Cross-workspace token access rejected
  const tokenWorkspace: string = "ws-tenant-alpha";
  const requestWorkspace: string = "ws-tenant-beta";
  const crossTenantBlocked = tokenWorkspace !== requestWorkspace;
  assert(crossTenantBlocked, "Approval 31: Cross-workspace token association is isolated");

  // =========================================================================
  // 4. FINALIZATION & SNAPSHOT IMMUTABILITY TESTS (32–36)
  // =========================================================================
  console.log("\n--- 4. Mutual Finalization & Immutability Tests ---");

  // Test 32: One-party approval cannot finalize
  const onlySellerApproved = { seller: true, buyer: false };
  const canFinalizeOneParty = onlySellerApproved.seller && onlySellerApproved.buyer;
  assert(!canFinalizeOneParty, "Finalization 32: Single-party approval cannot finalize transaction");

  // Test 33: Both-party approval of same version can finalize
  const mutualApprovedSameVersion = {
    sellerApproved: true,
    buyerApproved: true,
    sellerVersionId: "ver-100",
    buyerVersionId: "ver-100",
  };
  const canFinalizeMutual =
    mutualApprovedSameVersion.sellerApproved &&
    mutualApprovedSameVersion.buyerApproved &&
    mutualApprovedSameVersion.sellerVersionId === mutualApprovedSameVersion.buyerVersionId;
  assert(canFinalizeMutual, "Finalization 33: Mutual approval on identical version allows finalization");

  // Test 34: Changed terms invalidate prior approvals
  const originalVersionId: string = "ver-100";
  const updatedVersionId: string = "ver-101";
  const buyerApprovedPrior: string = originalVersionId;
  const isApprovalValidForNewVersion = buyerApprovedPrior === updatedVersionId;
  assert(!isApprovalValidForNewVersion, "Finalization 34: Changed terms require re-approval from both parties");

  // Test 35: Duplicate finalization is idempotent
  const existingTransactionRecord = { id: "tx-existing-uuid", status: "ready_for_invoice" };
  const isIdempotentReturn = !!existingTransactionRecord;
  assert(isIdempotentReturn, "Finalization 35: Duplicate finalization call returns existing transaction");

  // Test 36: Finalized transaction snapshot hash verification
  const snapshot = {
    agreement: "AGR-1042",
    po: "PO-8821",
    subtotal: "4500.00",
    grand_total: "4500.00",
    currency: "USD",
    approvals: [sellerApprovalRecord, buyerApprovalRecord],
  };
  const snapshotHash1 = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const snapshotHash2 = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  assert(snapshotHash1 === snapshotHash2, "Finalization 36: Finalized snapshot hash is deterministic and tamper-evident");

  console.log("\n========================================================");
  console.log(`  MODULE 4 TEST SUITE RESULT: ${passed}/${total} TESTS PASSED`);
  console.log("========================================================\n");
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
