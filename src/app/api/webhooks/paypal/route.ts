// src/app/api/webhooks/paypal/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  verifyWebhookSignature,
  getInvoice,
  isPayPalConfigured,
} from "@/lib/server/paypal/client";
import {
  recordWebhookEvent,
  updateWebhookEventStatus,
  getPayPalInvoiceByPayPalId,
  updatePayPalInvoiceRecord,
  recordModule5Audit,
} from "@/lib/server/repositories/paypal";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // 1. Extract required PayPal signature headers
  const authAlgo = request.headers.get("paypal-auth-algo") || "";
  const certUrl = request.headers.get("paypal-cert-url") || "";
  const transmissionId = request.headers.get("paypal-transmission-id") || "";
  const transmissionSig = request.headers.get("paypal-transmission-sig") || "";
  const transmissionTime = request.headers.get("paypal-transmission-time") || "";
  const webhookId = process.env.PAYPAL_WEBHOOK_ID || "";

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return NextResponse.json(
      { success: false, error: "Missing required PayPal signature headers" },
      { status: 400 }
    );
  }

  // 2. Compute payload SHA-256 hash
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");

  // 3. Parse JSON event
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventId = (event.id as string) || "";
  const eventType = (event.event_type as string) || "";
  const resource = (event.resource as Record<string, unknown>) || {};
  const paypalInvoiceId = (resource.id as string) || null;

  if (!eventId || !eventType) {
    return NextResponse.json({ success: false, error: "Malformed webhook event structure" }, { status: 400 });
  }

  // 4. Verify signature via official PayPal API
  let isSignatureValid = false;
  if (webhookId && isPayPalConfigured()) {
    isSignatureValid = await verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId,
      webhookEvent: event,
    });
  }

  // 5. Record incoming webhook in audit table
  const { id: webhookRecordId, isDuplicate } = await recordWebhookEvent({
    paypalEventId: eventId,
    eventType,
    paypalInvoiceId,
    payloadHash,
    signatureVerified: isSignatureValid,
    rawSummary: {
      summary: event.summary,
      resource_type: event.resource_type,
      create_time: event.create_time,
    },
  });

  if (isDuplicate) {
    return NextResponse.json(
      { success: true, message: "Duplicate webhook event already handled." },
      { status: 200 }
    );
  }

  // If signature verification failed, reject and DO NOT update financial records
  if (!isSignatureValid) {
    await updateWebhookEventStatus(webhookRecordId, "failed", "SIGNATURE_VERIFICATION_FAILED");
    return NextResponse.json(
      { success: false, error: "PayPal webhook signature verification failed" },
      { status: 401 }
    );
  }

  // 6. Match event to local PayPal invoice record
  if (!paypalInvoiceId) {
    await updateWebhookEventStatus(webhookRecordId, "ignored", "NO_INVOICE_ID_IN_RESOURCE");
    return NextResponse.json({ success: true, message: "No invoice ID associated" }, { status: 200 });
  }

  const invoiceRecord = await getPayPalInvoiceByPayPalId(paypalInvoiceId);
  if (!invoiceRecord) {
    await updateWebhookEventStatus(webhookRecordId, "ignored", "UNKNOWN_INVOICE");
    return NextResponse.json({ success: true, message: "Invoice not found in workspace" }, { status: 200 });
  }

  // 7. Authoritative status reconciliation for payment / status events
  try {
    let remoteInvoice = resource;
    // Always attempt authoritative GET from PayPal if possible
    if (isPayPalConfigured()) {
      try {
        remoteInvoice = await getInvoice(paypalInvoiceId);
      } catch (e) {
        console.warn("[Webhook Sync] Fallback to webhook resource payload:", e);
      }
    }

    const rawStatus = ((remoteInvoice.status as string) || "UNKNOWN").toUpperCase();
    const payments = (remoteInvoice.payments as { paid_amount?: { value?: string } }) || {};
    const dueAmountObj = (remoteInvoice.due_amount as { value?: string }) || {};

    const amountPaid = payments.paid_amount?.value ? parseFloat(payments.paid_amount.value) : invoiceRecord.amount_paid;
    const amountDue = dueAmountObj.value ? parseFloat(dueAmountObj.value) : invoiceRecord.amount_due;

    let normalizedStatus = invoiceRecord.normalized_status;
    let isFullyPaid = false;

    if (rawStatus === "PAID" || rawStatus === "MARKED_AS_PAID") {
      if (amountDue === 0 || (amountPaid > 0 && amountDue <= 0.01)) {
        normalizedStatus = "paid";
        isFullyPaid = true;
      } else {
        normalizedStatus = "partially_paid";
      }
    } else if (rawStatus === "PARTIALLY_PAID") {
      normalizedStatus = "partially_paid";
    } else if (rawStatus === "CANCELLED") {
      normalizedStatus = "cancelled";
    } else if (rawStatus === "REFUNDED") {
      normalizedStatus = "refunded";
    } else if (rawStatus === "PARTIALLY_REFUNDED") {
      normalizedStatus = "partially_refunded";
    }

    const now = new Date().toISOString();
    const prevStatus = invoiceRecord.normalized_status;

    await updatePayPalInvoiceRecord(invoiceRecord.id, {
      paypal_status: rawStatus,
      normalized_status: normalizedStatus,
      amount_paid: amountPaid,
      amount_due: amountDue,
      paid_at: isFullyPaid && !invoiceRecord.paid_at ? now : invoiceRecord.paid_at,
      last_synced_at: now,
    });

    if (isFullyPaid && prevStatus !== "paid") {
      const adminClient = createAdminClient();
      await adminClient
        .from("finalized_transactions")
        .update({ transaction_status: "paid" })
        .eq("id", invoiceRecord.finalized_transaction_id);

      await recordModule5Audit(
        invoiceRecord.workspace_id,
        "paypal_invoice",
        invoiceRecord.id,
        "paypal_invoice.paid",
        {
          webhook_event_id: eventId,
          paypal_invoice_id: paypalInvoiceId,
          amount_paid: amountPaid,
          amount_due: amountDue,
        }
      );
    } else if (normalizedStatus === "partially_paid" && prevStatus !== "partially_paid") {
      await recordModule5Audit(
        invoiceRecord.workspace_id,
        "paypal_invoice",
        invoiceRecord.id,
        "paypal_invoice.partially_paid",
        {
          webhook_event_id: eventId,
          paypal_invoice_id: paypalInvoiceId,
          amount_paid: amountPaid,
          amount_due: amountDue,
        }
      );
    }

    await updateWebhookEventStatus(webhookRecordId, "processed");

    return NextResponse.json(
      {
        success: true,
        message: "Webhook processed and invoice status reconciled successfully.",
        data: {
          eventId,
          eventType,
          normalizedStatus,
          isFullyPaid,
        },
      },
      { status: 200 }
    );
  } catch (procErr: unknown) {
    const msg = procErr instanceof Error ? procErr.message : "Reconciliation error";
    await updateWebhookEventStatus(webhookRecordId, "failed", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
