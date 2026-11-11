// src/app/api/transactions/[id]/paypal-invoice/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import {
  getPayPalInvoiceRecordByTransaction,
  updatePayPalInvoiceRecord,
  recordModule5Audit,
} from "@/lib/server/repositories/paypal";
import { getInvoice, isPayPalConfigured, PayPalError } from "@/lib/server/paypal/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transactionId = params.id;
    const { workspaceId } = await requireAuth(["owner", "admin", "finance", "reviewer"]);

    const invoiceRecord = await getPayPalInvoiceRecordByTransaction(workspaceId, transactionId);
    if (!invoiceRecord || !invoiceRecord.paypal_invoice_id) {
      return NextResponse.json(
        {
          success: false,
          error: "No PayPal invoice found for this transaction.",
          code: "INVOICE_NOT_FOUND",
        },
        { status: 404 }
      );
    }

    if (!isPayPalConfigured()) {
      return NextResponse.json(
        {
          success: true,
          synced: false,
          message: "PayPal credentials not configured. Returning last persisted state.",
          data: invoiceRecord,
        },
        { status: 200 }
      );
    }

    // Fetch authoritative invoice from PayPal
    let remoteInvoice: Record<string, unknown>;
    try {
      remoteInvoice = await getInvoice(invoiceRecord.paypal_invoice_id);
    } catch (apiErr: unknown) {
      const safeCode = apiErr instanceof PayPalError ? apiErr.safeCode : "FETCH_STATUS_FAILED";
      const message = apiErr instanceof Error ? apiErr.message : "Failed to retrieve invoice from PayPal";
      return NextResponse.json(
        { success: false, error: message, code: safeCode },
        { status: apiErr instanceof PayPalError ? apiErr.statusCode : 502 }
      );
    }

    const rawStatus = ((remoteInvoice.status as string) || "UNKNOWN").toUpperCase();
    const payments = (remoteInvoice.payments as { paid_amount?: { value?: string } }) || {};
    const dueAmountObj = (remoteInvoice.due_amount as { value?: string }) || {};

    const amountPaid = payments.paid_amount?.value ? parseFloat(payments.paid_amount.value) : invoiceRecord.amount_paid;
    const amountDue = dueAmountObj.value ? parseFloat(dueAmountObj.value) : invoiceRecord.amount_due;

    let normalizedStatus = invoiceRecord.normalized_status;
    let isFullyPaid = false;

    if (rawStatus === "PAID" || rawStatus === "MARKED_AS_PAID") {
      // Must verify amount due is 0 or paid >= invoice amount
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
    } else if (rawStatus === "SENT" || rawStatus === "UNPAID") {
      normalizedStatus = "sent";
    }

    const now = new Date().toISOString();
    const previousStatus = invoiceRecord.normalized_status;

    // Update local record
    const updatedRecord = await updatePayPalInvoiceRecord(invoiceRecord.id, {
      paypal_status: rawStatus,
      normalized_status: normalizedStatus,
      amount_paid: amountPaid,
      amount_due: amountDue,
      paid_at: isFullyPaid && !invoiceRecord.paid_at ? now : invoiceRecord.paid_at,
      last_synced_at: now,
    });

    // If transitioned to fully paid, update finalized_transaction
    if (isFullyPaid && previousStatus !== "paid") {
      const adminClient = createAdminClient();
      await adminClient
        .from("finalized_transactions")
        .update({ transaction_status: "paid" })
        .eq("id", transactionId);

      await recordModule5Audit(
        workspaceId,
        "paypal_invoice",
        updatedRecord.id,
        "paypal_invoice.paid",
        {
          transaction_id: transactionId,
          paypal_invoice_id: invoiceRecord.paypal_invoice_id,
          amount_paid: amountPaid,
          amount_due: amountDue,
        }
      );
    } else if (normalizedStatus === "partially_paid" && previousStatus !== "partially_paid") {
      await recordModule5Audit(
        workspaceId,
        "paypal_invoice",
        updatedRecord.id,
        "paypal_invoice.partially_paid",
        {
          transaction_id: transactionId,
          paypal_invoice_id: invoiceRecord.paypal_invoice_id,
          amount_paid: amountPaid,
          amount_due: amountDue,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        synced: true,
        data: {
          recordId: updatedRecord.id,
          paypalInvoiceId: updatedRecord.paypal_invoice_id,
          rawStatus,
          normalizedStatus: updatedRecord.normalized_status,
          amountPaid: updatedRecord.amount_paid,
          amountDue: updatedRecord.amount_due,
          paidAt: updatedRecord.paid_at,
          lastSyncedAt: updatedRecord.last_synced_at,
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
