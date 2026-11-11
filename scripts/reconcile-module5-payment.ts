// scripts/reconcile-module5-payment.ts
/**
 * TERMBridge Module 5.2 — Authoritative PayPal Reconciliation & Verification.
 *
 * Checks PayPal Sandbox directly for invoice INV2-D982-L4YU-G3PY-GGFV:
 * - Checks current status (SENT vs PAID)
 * - Verifies due_amount and amount_paid
 * - Checks whether webhook event has arrived
 * - Updates Supabase if fully paid
 */

import * as path from "path";
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { getInvoice, isPayPalConfigured } from "../src/lib/server/paypal/client";

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

const INVOICE_ID = "INV2-D982-L4YU-G3PY-GGFV";
const TX_ID = "6cd03f2d-020b-4280-8f13-e566c64cb3f6";

async function main() {
  console.log("================================================================================");
  console.log("   TERMBridge Module 5.2 — Live Authoritative Payment Reconciliation            ");
  console.log("================================================================================\n");

  if (!isPayPalConfigured()) {
    throw new Error("PayPal credentials not configured.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // 1. Authoritative check from PayPal Sandbox
  console.log(`[Step 1] Polling authoritative invoice state directly from PayPal API...`);
  const inv = await getInvoice(INVOICE_ID);

  const rawStatus = ((inv.status as string) || "UNKNOWN").toUpperCase();
  const totalVal = (inv.amount as any)?.value || "0.00";
  const dueVal = (inv.due_amount as any)?.value || "0.00";
  const paidVal = (inv.payments as any)?.paid_amount?.value || "0.00";

  console.log(`   - Invoice ID:       ${inv.id}`);
  console.log(`   - Current Status:   ${rawStatus}`);
  console.log(`   - Total Amount:     $${totalVal} ${(inv.amount as any)?.currency_code}`);
  console.log(`   - Amount Due:       $${dueVal}`);
  console.log(`   - Amount Paid:      $${paidVal}\n`);

  const dueNum = parseFloat(dueVal);
  const paidNum = parseFloat(paidVal);
  const isFullyPaid = (rawStatus === "PAID" || rawStatus === "MARKED_AS_PAID") && dueNum === 0;

  // 2. Check webhook events table
  console.log(`[Step 2] Checking received webhook events for invoice ${INVOICE_ID}...`);
  const { data: webhooks, error: whError } = await adminClient
    .from("paypal_webhook_events")
    .select("*")
    .eq("paypal_invoice_id", INVOICE_ID)
    .order("received_at", { ascending: false });

  if (whError) {
    console.warn("   ⚠ Webhook query notice:", whError.message);
  } else if (!webhooks || webhooks.length === 0) {
    console.log("   ℹ No webhook events received yet from PayPal for this invoice.");
  } else {
    console.log(`   ✓ Found ${webhooks.length} webhook event(s):`);
    for (const wh of webhooks) {
      console.log(`     - Event ID: ${wh.paypal_event_id} | Type: ${wh.event_type} | Verified: ${wh.signature_verified} | Status: ${wh.processing_status}`);
    }
  }

  // 3. Status reconciliation
  console.log(`\n[Step 3] Reconciling state...`);
  if (!isFullyPaid) {
    console.log(`   ℹ Invoice is currently in '${rawStatus}' state (Due: $${dueVal}, Paid: $${paidVal}).`);
    console.log(`   ℹ Transaction status remains 'invoiced' pending buyer payment.`);
    console.log(`   → Buyer payment link: https://www.sandbox.paypal.com/invoice/p/#D982L4YUG3PYGGFV`);
    return;
  }

  console.log(`   🎉 PayPal reports invoice is FULLY PAID! ($${paidVal} paid, $0.00 due).`);

  // Update paypal_invoice_records
  const now = new Date().toISOString();
  await adminClient
    .from("paypal_invoice_records")
    .update({
      paypal_status: rawStatus,
      normalized_status: "paid",
      amount_paid: paidNum,
      amount_due: dueNum,
      paid_at: now,
      last_synced_at: now,
    })
    .eq("paypal_invoice_id", INVOICE_ID);

  // Update finalized_transactions
  await adminClient
    .from("finalized_transactions")
    .update({ transaction_status: "paid" })
    .eq("id", TX_ID);

  // Log audit event
  const { data: invRecord } = await adminClient
    .from("paypal_invoice_records")
    .select("id")
    .eq("paypal_invoice_id", INVOICE_ID)
    .single();

  if (invRecord) {
    await adminClient.from("audit_events").insert({
      workspace_id: "6367ff77-f333-4de6-90c9-82bfc5b34743",
      actor_type: "system",
      entity_type: "paypal_invoice",
      entity_id: invRecord.id,
      event_type: "paypal_invoice.paid",
      details: {
        transaction_id: TX_ID,
        paypal_invoice_id: INVOICE_ID,
        amount_paid: paidNum,
        amount_due: dueNum,
        authoritative_status: rawStatus,
      },
    });
  }

  console.log(`   ✓ Updated paypal_invoice_records to 'paid'`);
  console.log(`   ✓ Updated finalized_transactions to 'paid'`);
  console.log(`   ✓ Appended immutable audit event 'paypal_invoice.paid'`);
}

main().catch((err) => {
  console.error("Reconciliation error:", err);
  process.exit(1);
});
