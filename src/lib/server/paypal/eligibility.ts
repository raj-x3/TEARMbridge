// src/lib/server/paypal/eligibility.ts
/**
 * Finalized Transaction Eligibility Verification Service (Module 5 Phase 3).
 *
 * Enforces all 14 criteria before any PayPal invoice can be created or sent:
 * 1. Transaction status is 'ready_for_invoice' (or allowed pending state)
 * 2. Counteroffer exists and belongs to the workspace
 * 3. Counteroffer version exists
 * 4. Seller approval exists on that exact version
 * 5. Buyer acceptance exists on that exact version
 * 6. Both approvals share the identical terms_hash
 * 7. Snapshot hash is present, valid 64-character SHA-256
 * 8. Snapshot structure integrity verified
 * 9. Transaction has not already been invoiced
 * 10. Recipient email exists and has valid format
 * 11. Merchant invoicer details exist
 * 12. Currency is supported by PayPal (USD)
 * 13. Exact arithmetic validation succeeds
 * 14. Invoice total matches finalized snapshot grand total
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { parseToCents } from "@/lib/server/intelligence/commercial-validator";
import { FinalizedTransactionRow } from "./invoice-mapper";

export interface EligibilityResult {
  eligible: boolean;
  rejectionReason?: string;
  transaction?: FinalizedTransactionRow;
  counteroffer?: Record<string, unknown>;
  version?: Record<string, unknown>;
  sellerApproval?: Record<string, unknown>;
  buyerApproval?: Record<string, unknown>;
}

export async function validateTransactionEligibility(
  workspaceId: string,
  transactionId: string
): Promise<EligibilityResult> {
  const adminClient = createAdminClient();

  // 1. Fetch finalized transaction
  const { data: tx, error: txError } = await adminClient
    .from("finalized_transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", transactionId)
    .single();

  if (txError || !tx) {
    return {
      eligible: false,
      rejectionReason: `Finalized transaction '${transactionId}' not found in workspace '${workspaceId}'.`,
    };
  }

  // Check 1: transaction_status must be 'ready_for_invoice' (or 'invoicing')
  if (tx.transaction_status !== "ready_for_invoice" && tx.transaction_status !== "invoicing") {
    return {
      eligible: false,
      rejectionReason: `Transaction status is '${tx.transaction_status}'. Expected 'ready_for_invoice'.`,
      transaction: tx,
    };
  }

  // Check 2: Counteroffer exists
  const { data: co, error: coError } = await adminClient
    .from("counteroffers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", tx.counteroffer_id)
    .single();

  if (coError || !co) {
    return {
      eligible: false,
      rejectionReason: "Referenced counteroffer does not exist in workspace.",
      transaction: tx,
    };
  }

  // Check 3: Counteroffer version exists
  const { data: version, error: verError } = await adminClient
    .from("counteroffer_versions")
    .select("*")
    .eq("counteroffer_id", co.id)
    .eq("id", tx.counteroffer_version_id)
    .single();

  if (verError || !version) {
    return {
      eligible: false,
      rejectionReason: "Referenced counteroffer version does not exist.",
      transaction: tx,
    };
  }

  // Check 4 & 5: Mutual approvals exist on this exact version
  const { data: approvals, error: appError } = await adminClient
    .from("counteroffer_approvals")
    .select("*")
    .eq("counteroffer_version_id", version.id);

  if (appError || !approvals || approvals.length === 0) {
    return {
      eligible: false,
      rejectionReason: "No approval records found for this version.",
      transaction: tx,
    };
  }

  const sellerApproval = approvals.find((a) => a.approver_type === "seller");
  const buyerApproval = approvals.find((a) => a.approver_type === "buyer");

  if (!sellerApproval) {
    return {
      eligible: false,
      rejectionReason: "Missing seller approval on finalized version.",
      transaction: tx,
    };
  }

  if (!buyerApproval) {
    return {
      eligible: false,
      rejectionReason: "Missing buyer acceptance on finalized version.",
      transaction: tx,
    };
  }

  // Check 6: Both approvals have matching terms_hash
  if (
    sellerApproval.terms_hash !== version.terms_hash ||
    buyerApproval.terms_hash !== version.terms_hash
  ) {
    return {
      eligible: false,
      rejectionReason: "Approval terms hash mismatch across seller, buyer, or proposal version.",
      transaction: tx,
    };
  }

  // Check 7 & 8: Snapshot hash and structure integrity
  if (!tx.snapshot_hash || typeof tx.snapshot_hash !== "string" || tx.snapshot_hash.length !== 64) {
    return {
      eligible: false,
      rejectionReason: "Invalid or missing snapshot SHA-256 hash on finalized transaction.",
      transaction: tx,
    };
  }

  const snapshot = tx.transaction_snapshot;
  if (!snapshot || !snapshot.agreement || !snapshot.purchase_order || !snapshot.approved_terms) {
    return {
      eligible: false,
      rejectionReason: "Finalized transaction snapshot is structurally incomplete or corrupted.",
      transaction: tx,
    };
  }

  // Check 9: Transaction has not already been invoiced
  const { data: existingInvoices } = await adminClient
    .from("paypal_invoice_records")
    .select("id, normalized_status, paypal_invoice_id")
    .eq("finalized_transaction_id", tx.id);

  if (existingInvoices && existingInvoices.length > 0) {
    const activeInv = existingInvoices.find(
      (inv) => inv.normalized_status !== "cancelled" && inv.paypal_invoice_id
    );
    if (activeInv) {
      return {
        eligible: false,
        rejectionReason: `Transaction is already linked to PayPal invoice ${activeInv.paypal_invoice_id} (${activeInv.normalized_status}).`,
        transaction: tx,
      };
    }
  }

  // Check 10: Recipient email exists and is valid
  const buyerEmail = snapshot.buyer?.email || tx.buyer_email;
  if (!buyerEmail || !buyerEmail.includes("@") || !buyerEmail.includes(".")) {
    return {
      eligible: false,
      rejectionReason: `Invalid or missing buyer email: '${buyerEmail}'.`,
      transaction: tx,
    };
  }

  // Check 11: Merchant invoicer details exist
  if (!snapshot.supplier?.display_name) {
    return {
      eligible: false,
      rejectionReason: "Merchant supplier details missing in transaction snapshot.",
      transaction: tx,
    };
  }

  // Check 12: Currency is USD
  const currency = (tx.currency || snapshot.approved_terms.currency || "USD").toUpperCase();
  if (currency !== "USD") {
    return {
      eligible: false,
      rejectionReason: `Currency '${currency}' is not supported for standard PayPal Invoicing integration.`,
      transaction: tx,
    };
  }

  // Check 13: Exact arithmetic validation
  const qty = snapshot.approved_terms.quantity;
  const unitPriceCents = snapshot.approved_terms.unit_price_cents;
  const discountPercent = snapshot.approved_terms.discount_percent;

  const grossCents = qty * unitPriceCents;
  const discountCents = Math.round((grossCents * discountPercent) / 100);
  const calculatedGrandTotalCents = grossCents - discountCents;

  const snapshotGrandTotalCents = parseToCents(snapshot.financial_summary?.grand_total || tx.grand_total);

  if (calculatedGrandTotalCents !== snapshotGrandTotalCents) {
    return {
      eligible: false,
      rejectionReason: `Arithmetic inconsistency: Calculated net total (${calculatedGrandTotalCents} cents) does not match snapshot grand total (${snapshotGrandTotalCents} cents).`,
      transaction: tx,
    };
  }

  // Check 14: Invoice total matches finalized snapshot
  if (Math.abs(Number(tx.grand_total) - calculatedGrandTotalCents / 100) > 0.001) {
    return {
      eligible: false,
      rejectionReason: "Finalized transaction grand_total does not match validated calculation.",
      transaction: tx,
    };
  }

  return {
    eligible: true,
    transaction: tx as FinalizedTransactionRow,
    counteroffer: co,
    version,
    sellerApproval,
    buyerApproval,
  };
}
