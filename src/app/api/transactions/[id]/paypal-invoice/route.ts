// src/app/api/transactions/[id]/paypal-invoice/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { getPayPalInvoiceRecordByTransaction } from "@/lib/server/repositories/paypal";
import { getFinalizedTransaction } from "@/lib/server/repositories/decisions";
import { getInvoice, isPayPalConfigured } from "@/lib/server/paypal/client";
import { parseToCents } from "@/lib/server/intelligence/commercial-validator";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transactionId = params.id;
    const { workspaceId } = await requireAuth(["owner", "admin", "finance", "reviewer"]);

    const invoiceRecord = await getPayPalInvoiceRecordByTransaction(workspaceId, transactionId);
    const tx = await getFinalizedTransaction(workspaceId, transactionId);

    if (!tx) {
      return NextResponse.json(
        { success: false, error: "Finalized transaction not found" },
        { status: 404 }
      );
    }

    if (!invoiceRecord) {
      return NextResponse.json(
        {
          success: true,
          exists: false,
          transaction: {
            id: tx.id,
            status: tx.transaction_status,
            grand_total: tx.grand_total,
            currency: tx.currency,
            buyer_email: tx.buyer_email,
            snapshot: tx.transaction_snapshot,
          },
        },
        { status: 200 }
      );
    }

    let authoritativeData: Record<string, unknown> | null = null;
    let discrepancy: string | null = null;

    if (invoiceRecord.paypal_invoice_id && isPayPalConfigured()) {
      try {
        authoritativeData = await getInvoice(invoiceRecord.paypal_invoice_id);

        // Verification against snapshot
        const ppAmount = (authoritativeData.amount as { value?: string })?.value;
        const ppCurrency = (authoritativeData.amount as { currency_code?: string })?.currency_code;
        const ppRecipients = authoritativeData.primary_recipients as Array<{
          billing_info?: { email_address?: string };
        }>;
        const ppEmail = ppRecipients?.[0]?.billing_info?.email_address;

        if (ppAmount && parseToCents(ppAmount) !== parseToCents(tx.grand_total)) {
          discrepancy = `Amount discrepancy: PayPal invoice is ${ppAmount} but finalized snapshot is ${tx.grand_total}.`;
        } else if (ppCurrency && ppCurrency !== tx.currency) {
          discrepancy = `Currency discrepancy: PayPal invoice is ${ppCurrency} but snapshot is ${tx.currency}.`;
        } else if (ppEmail && tx.buyer_email && ppEmail.toLowerCase() !== tx.buyer_email.toLowerCase()) {
          discrepancy = `Recipient email mismatch: PayPal has ${ppEmail} but snapshot has ${tx.buyer_email}.`;
        }
      } catch (fetchErr) {
        console.warn("[PayPal Sync Warning] Failed to fetch remote invoice:", fetchErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        exists: true,
        data: {
          record: invoiceRecord,
          remoteData: authoritativeData,
          hasDiscrepancy: !!discrepancy,
          discrepancyReason: discrepancy,
          transaction: {
            id: tx.id,
            status: tx.transaction_status,
            grand_total: tx.grand_total,
            currency: tx.currency,
            buyer_email: tx.buyer_email,
          },
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
