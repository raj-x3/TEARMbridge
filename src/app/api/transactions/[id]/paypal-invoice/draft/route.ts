// src/app/api/transactions/[id]/paypal-invoice/draft/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { validateTransactionEligibility } from "@/lib/server/paypal/eligibility";
import { mapFinalizedTransactionToPayPalInvoice } from "@/lib/server/paypal/invoice-mapper";
import {
  createDraftInvoice,
  isPayPalConfigured,
  PayPalError,
} from "@/lib/server/paypal/client";
import {
  getPayPalInvoiceRecordByTransaction,
  getOrCreatePayPalInvoiceDraftRecord,
  updatePayPalInvoiceRecord,
  getOrCreateApiOperation,
  updateApiOperationStatus,
  recordModule5Audit,
} from "@/lib/server/repositories/paypal";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transactionId = params.id;
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);

    // 1. Eligibility validation
    const eligibility = await validateTransactionEligibility(workspaceId, transactionId);
    if (!eligibility.eligible || !eligibility.transaction) {
      return NextResponse.json(
        {
          success: false,
          error: eligibility.rejectionReason || "Transaction is not eligible for invoicing.",
          code: "INELIGIBLE_TRANSACTION",
        },
        { status: 400 }
      );
    }

    const tx = eligibility.transaction;

    // 2. Check if already has an invoice
    const existingRecord = await getPayPalInvoiceRecordByTransaction(workspaceId, transactionId);
    if (existingRecord?.paypal_invoice_id && existingRecord.normalized_status !== "cancelled") {
      return NextResponse.json(
        {
          success: true,
          message: "Invoice draft already exists for this transaction.",
          data: {
            invoiceRecordId: existingRecord.id,
            paypalInvoiceId: existingRecord.paypal_invoice_id,
            invoiceNumber: existingRecord.invoice_number,
            status: existingRecord.normalized_status,
            amount: existingRecord.invoice_amount,
            currency: existingRecord.currency_code,
          },
        },
        { status: 200 }
      );
    }

    // 3. Map finalized transaction snapshot to PayPal schema
    const { payload, invoiceNumber } = mapFinalizedTransactionToPayPalInvoice(tx);

    // 4. Get or create stable request ID and operation record
    const clientRequestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const invoiceRecord = await getOrCreatePayPalInvoiceDraftRecord({
      workspaceId,
      transactionId,
      recipientEmail: payload.primary_recipients[0].billing_info.email_address,
      invoiceAmount: Number(tx.grand_total),
      currencyCode: payload.detail.currency_code,
      createRequestId: clientRequestId,
      createdBy: userId,
    });

    const operation = await getOrCreateApiOperation({
      workspaceId,
      transactionId,
      operationType: "create_draft",
      requestId: invoiceRecord.create_request_id,
    });

    // 5. Check if PayPal is configured
    if (!isPayPalConfigured()) {
      await updateApiOperationStatus(operation.id, "failed", {
        reason: "PayPal credentials not configured",
      });

      return NextResponse.json(
        {
          success: false,
          error: "PayPal Sandbox credentials are not configured in environment.",
          code: "PAYPAL_NOT_CONFIGURED",
          data: {
            invoiceRecordId: invoiceRecord.id,
            invoiceNumber,
            payableAmount: tx.grand_total,
            currency: tx.currency,
          },
        },
        { status: 503 }
      );
    }

    // 6. Call PayPal to create draft invoice
    await updateApiOperationStatus(operation.id, "in_progress");

    let paypalResponse;
    try {
      paypalResponse = await createDraftInvoice(
        payload as unknown as Record<string, unknown>,
        invoiceRecord.create_request_id
      );
    } catch (apiErr: unknown) {
      const safeCode = apiErr instanceof PayPalError ? apiErr.safeCode : "PAYPAL_API_ERROR";
      const message = apiErr instanceof Error ? apiErr.message : "Draft invoice creation failed";

      await updateApiOperationStatus(operation.id, "failed", { error: message, code: safeCode });
      await updatePayPalInvoiceRecord(invoiceRecord.id, { safe_error_code: safeCode });

      return NextResponse.json(
        { success: false, error: message, code: safeCode },
        { status: apiErr instanceof PayPalError ? apiErr.statusCode : 502 }
      );
    }

    const paypalInvoiceId = paypalResponse.id;
    if (!paypalInvoiceId) {
      await updateApiOperationStatus(operation.id, "failed", { error: "Missing invoice ID from PayPal response" });
      return NextResponse.json(
        { success: false, error: "Malformed response from PayPal API", code: "PAYPAL_MALFORMED_RESPONSE" },
        { status: 502 }
      );
    }

    // 7. Update database records
    const updatedRecord = await updatePayPalInvoiceRecord(invoiceRecord.id, {
      paypal_invoice_id: paypalInvoiceId,
      invoice_number: invoiceNumber,
      paypal_status: (paypalResponse.status as string) || "DRAFT",
      normalized_status: "draft",
      draft_created_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      safe_error_code: null,
    });

    // Update transaction status to invoicing
    const adminClient = createAdminClient();
    await adminClient
      .from("finalized_transactions")
      .update({ transaction_status: "invoicing" })
      .eq("id", transactionId);

    await updateApiOperationStatus(operation.id, "succeeded", {
      paypal_invoice_id: paypalInvoiceId,
      status: paypalResponse.status,
    });

    // 8. Record audit event
    await recordModule5Audit(
      workspaceId,
      "paypal_invoice",
      updatedRecord.id,
      "paypal_invoice.draft_created",
      {
        transaction_id: transactionId,
        paypal_invoice_id: paypalInvoiceId,
        invoice_number: invoiceNumber,
        amount: tx.grand_total,
        currency: tx.currency,
        buyer_email: payload.primary_recipients[0].billing_info.email_address,
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: "PayPal draft invoice successfully created.",
        data: {
          invoiceRecordId: updatedRecord.id,
          paypalInvoiceId: updatedRecord.paypal_invoice_id,
          invoiceNumber: updatedRecord.invoice_number,
          status: updatedRecord.normalized_status,
          amount: updatedRecord.invoice_amount,
          currency: updatedRecord.currency_code,
          recipientEmail: updatedRecord.recipient_email,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
