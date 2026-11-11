// src/app/api/transactions/[id]/paypal-invoice/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import {
  getPayPalInvoiceRecordByTransaction,
  updatePayPalInvoiceRecord,
  getOrCreateApiOperation,
  updateApiOperationStatus,
  recordModule5Audit,
} from "@/lib/server/repositories/paypal";
import {
  sendInvoice,
  getInvoice,
  isPayPalConfigured,
  PayPalError,
} from "@/lib/server/paypal/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transactionId = params.id;
    const { workspaceId } = await requireAuth(["owner", "admin", "finance"]);

    // 1. Fetch local invoice record
    const invoiceRecord = await getPayPalInvoiceRecordByTransaction(workspaceId, transactionId);
    if (!invoiceRecord || !invoiceRecord.paypal_invoice_id) {
      return NextResponse.json(
        {
          success: false,
          error: "No PayPal draft invoice found for this transaction. Create a draft first.",
          code: "DRAFT_NOT_FOUND",
        },
        { status: 400 }
      );
    }

    if (invoiceRecord.normalized_status !== "draft") {
      return NextResponse.json(
        {
          success: false,
          error: `Invoice has already been sent (Current status: ${invoiceRecord.normalized_status}).`,
          code: "ALREADY_SENT",
          data: {
            status: invoiceRecord.normalized_status,
            sentAt: invoiceRecord.sent_at,
            viewUrl: invoiceRecord.recipient_view_url,
          },
        },
        { status: 400 }
      );
    }

    if (!isPayPalConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "PayPal Sandbox credentials are not configured.",
          code: "PAYPAL_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    // 2. Register send operation
    const sendRequestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const operation = await getOrCreateApiOperation({
      workspaceId,
      transactionId,
      operationType: "send_invoice",
      requestId: sendRequestId,
    });

    await updateApiOperationStatus(operation.id, "in_progress");

    // 3. Dispatch to PayPal
    let sendResult: Record<string, unknown>;
    try {
      sendResult = await sendInvoice(invoiceRecord.paypal_invoice_id, sendRequestId);
    } catch (err: unknown) {
      const safeCode = err instanceof PayPalError ? err.safeCode : "SEND_FAILED";
      const message = err instanceof Error ? err.message : "Failed to send invoice via PayPal";

      await updateApiOperationStatus(operation.id, "failed", { error: message, code: safeCode });
      return NextResponse.json(
        { success: false, error: message, code: safeCode },
        { status: err instanceof PayPalError ? err.statusCode : 502 }
      );
    }

    // 4. Fetch updated invoice from PayPal to capture recipient_view_url and authoritative status
    let recipientViewUrl = invoiceRecord.recipient_view_url;
    let remoteStatus = "SENT";
    try {
      const refreshed = await getInvoice(invoiceRecord.paypal_invoice_id);
      remoteStatus = (refreshed.status as string) || "SENT";
      const detail = refreshed.detail as { metadata?: { recipient_view_url?: string } };
      if (detail?.metadata?.recipient_view_url) {
        recipientViewUrl = detail.metadata.recipient_view_url;
      }
    } catch (refreshErr) {
      console.warn("[PayPal Fetch Warning] Could not fetch view URL after send:", refreshErr);
    }

    // 5. Update database records
    const sentAt = new Date().toISOString();
    const updatedRecord = await updatePayPalInvoiceRecord(invoiceRecord.id, {
      normalized_status: "sent",
      paypal_status: remoteStatus,
      sent_at: sentAt,
      last_synced_at: sentAt,
      send_request_id: sendRequestId,
      recipient_view_url: recipientViewUrl,
    });

    // Update transaction status to invoiced
    const adminClient = createAdminClient();
    await adminClient
      .from("finalized_transactions")
      .update({ transaction_status: "invoiced" })
      .eq("id", transactionId);

    await updateApiOperationStatus(operation.id, "succeeded", {
      sent_at: sentAt,
      recipient_view_url: recipientViewUrl,
      raw: sendResult,
    });

    // 6. Record audit event
    await recordModule5Audit(
      workspaceId,
      "paypal_invoice",
      updatedRecord.id,
      "paypal_invoice.sent",
      {
        transaction_id: transactionId,
        paypal_invoice_id: invoiceRecord.paypal_invoice_id,
        invoice_number: invoiceRecord.invoice_number,
        recipient_email: invoiceRecord.recipient_email,
        recipient_view_url: recipientViewUrl,
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "PayPal invoice successfully dispatched to buyer.",
        data: {
          invoiceRecordId: updatedRecord.id,
          paypalInvoiceId: updatedRecord.paypal_invoice_id,
          status: updatedRecord.normalized_status,
          sentAt: updatedRecord.sent_at,
          recipientViewUrl: updatedRecord.recipient_view_url,
          recipientEmail: updatedRecord.recipient_email,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
