// src/app/api/workspace/paypal-invoices/route.ts
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { workspaceId } = await requireAuth(["owner", "admin", "finance", "reviewer"]);
    const adminClient = createAdminClient();

    // 1. Fetch all PayPal invoice records for this workspace
    const { data: invoiceRecords, error: invError } = await adminClient
      .from("paypal_invoice_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (invError) {
      return NextResponse.json({ success: false, error: invError.message }, { status: 500 });
    }

    // 2. Fetch all finalized transactions to join snapshot metadata & find un-invoiced transactions
    const { data: transactions, error: txError } = await adminClient
      .from("finalized_transactions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("finalized_at", { ascending: false });

    if (txError) {
      return NextResponse.json({ success: false, error: txError.message }, { status: 500 });
    }

    const txMap = new Map((transactions || []).map((t) => [t.id, t]));

    // 3. Map invoice records with snapshot details
    const mappedInvoices = (invoiceRecords || []).map((rec) => {
      const tx = txMap.get(rec.finalized_transaction_id);
      const snapshot = tx?.transaction_snapshot || {};
      return {
        id: rec.id,
        workspaceId: rec.workspace_id,
        finalizedTransactionId: rec.finalized_transaction_id,
        paypalInvoiceId: rec.paypal_invoice_id,
        invoiceNumber: rec.invoice_number || `INV-${rec.id.slice(0, 8)}`,
        paypalStatus: rec.paypal_status,
        normalizedStatus: rec.normalized_status,
        currencyCode: rec.currency_code,
        invoiceAmount: rec.invoice_amount,
        amountPaid: rec.amount_paid,
        amountDue: rec.amount_due,
        recipientEmail: rec.recipient_email,
        recipientViewUrl: rec.recipient_view_url,
        createdAt: rec.created_at,
        draftCreatedAt: rec.draft_created_at,
        sentAt: rec.sent_at,
        paidAt: rec.paid_at,
        lastSyncedAt: rec.last_synced_at,
        safeErrorCode: rec.safe_error_code,
        // Joined details
        agreementReference: snapshot.agreement?.reference || "AGR-1042",
        poNumber: snapshot.purchase_order?.po_number || "PO-8821",
        buyerName: snapshot.buyer?.display_name || "Meridian Retail",
        supplierName: snapshot.supplier?.display_name || "Northstar Supply",
      };
    });

    // 4. Identify finalized transactions ready to be invoiced (no active invoice yet)
    const invoicedTxIds = new Set(
      (invoiceRecords || [])
        .filter((r) => r.normalized_status !== "cancelled")
        .map((r) => r.finalized_transaction_id)
    );

    const readyTransactions = (transactions || [])
      .filter((t) => !invoicedTxIds.has(t.id) && t.transaction_status === "ready_for_invoice")
      .map((t) => {
        const s = t.transaction_snapshot || {};
        return {
          id: t.id,
          agreementReference: s.agreement?.reference || "AGR-1042",
          poNumber: s.purchase_order?.po_number || "PO-8821",
          buyerName: s.buyer?.display_name || "Meridian Retail",
          buyerEmail: t.buyer_email || s.buyer?.email,
          grandTotal: t.grand_total,
          currency: t.currency,
          finalizedAt: t.finalized_at,
          termsHash: s.terms_hash,
          approvedTerms: s.approved_terms,
        };
      });

    return NextResponse.json(
      {
        success: true,
        data: {
          invoices: mappedInvoices,
          readyToInvoice: readyTransactions,
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
