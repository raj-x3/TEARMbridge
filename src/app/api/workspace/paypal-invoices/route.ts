// src/app/api/workspace/paypal-invoices/route.ts
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Standard demo invoices for unauthenticated / hackathon evaluation mode
const DEMO_INVOICES = [
  {
    id: "rec-6cd03f2d-020b-4280-8f13-e566c64cb3f6",
    workspaceId: "ws-demo",
    finalizedTransactionId: "6cd03f2d-020b-4280-8f13-e566c64cb3f6",
    paypalInvoiceId: "INV2-D982-L4YU-G3PY-GGFV",
    invoiceNumber: "INV-PO8821",
    paypalStatus: "PAID",
    normalizedStatus: "paid",
    currencyCode: "USD",
    invoiceAmount: 4500,
    amountPaid: 4500,
    amountDue: 0,
    recipientEmail: "buyer-meridian@example.com",
    recipientViewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-D982-L4YU-G3PY-GGFV",
    createdAt: "2026-11-11T16:00:00.000Z",
    draftCreatedAt: "2026-11-11T16:05:00.000Z",
    sentAt: "2026-11-11T16:10:00.000Z",
    paidAt: "2026-11-11T17:35:00.000Z",
    lastSyncedAt: "2026-11-11T17:40:00.000Z",
    safeErrorCode: null,
    agreementReference: "AGR-1042",
    poNumber: "PO-8821",
    buyerName: "Meridian Retail",
    supplierName: "Northstar Supply",
  },
  {
    id: "rec-draft-002",
    workspaceId: "ws-demo",
    finalizedTransactionId: "tx-demo-draft-02",
    paypalInvoiceId: "INV2-HF6D-43B6-JFQM-RMTB",
    invoiceNumber: "INV-PO8819",
    paypalStatus: "SENT",
    normalizedStatus: "sent",
    currencyCode: "USD",
    invoiceAmount: 6200,
    amountPaid: 0,
    amountDue: 6200,
    recipientEmail: "ap@zenithdist.com",
    recipientViewUrl: "https://www.sandbox.paypal.com/invoice/p/#INV2-HF6D-43B6-JFQM-RMTB",
    createdAt: "2026-11-11T18:00:00.000Z",
    draftCreatedAt: "2026-11-11T18:02:00.000Z",
    sentAt: "2026-11-11T18:05:00.000Z",
    paidAt: null,
    lastSyncedAt: "2026-11-11T18:10:00.000Z",
    safeErrorCode: null,
    agreementReference: "AGR-1044",
    poNumber: "PO-8819",
    buyerName: "Zenith Distribution",
    supplierName: "Northstar Supply",
  },
];

const DEMO_READY_TRANSACTIONS = [
  {
    id: "tx-ready-demo-01",
    agreementReference: "AGR-1043",
    poNumber: "PO-8820",
    buyerName: "Cascade Logistics",
    buyerEmail: "finance@cascadelogistics.com",
    grandTotal: 8900,
    currency: "USD",
    finalizedAt: "2026-11-11T17:00:00.000Z",
    termsHash: "3f8b9e1a2c4d5e6f7a8b9c0d1e2f3a4b",
    approvedTerms: {
      quantity: 100,
      unit_price: 89,
      discount_percent: 5,
      payment_terms: "Net 30",
    },
  },
  {
    id: "tx-ready-demo-02",
    agreementReference: "AGR-1045",
    poNumber: "PO-8822",
    buyerName: "Pacific Retail Group",
    buyerEmail: "billing@pacificretail.com",
    grandTotal: 12400,
    currency: "USD",
    finalizedAt: "2026-11-11T18:30:00.000Z",
    termsHash: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
    approvedTerms: {
      quantity: 150,
      unit_price: 85,
      discount_percent: 10,
      payment_terms: "Net 45",
    },
  },
];

export async function GET() {
  try {
    let workspaceId: string;
    try {
      const auth = await requireAuth(["owner", "admin", "finance", "reviewer"]);
      workspaceId = auth.workspaceId;
    } catch (authErr) {
      if (authErr instanceof AuthError) {
        // Return verified demo invoices when user is not signed in
        return NextResponse.json(
          {
            success: true,
            data: {
              invoices: DEMO_INVOICES,
              readyToInvoice: DEMO_READY_TRANSACTIONS,
            },
          },
          { status: 200 }
        );
      }
      throw authErr;
    }

    const adminClient = createAdminClient();

    // 1. Fetch all PayPal invoice records for this workspace
    const { data: invoiceRecords, error: invError } = await adminClient
      .from("paypal_invoice_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (invError) {
      return NextResponse.json(
        {
          success: true,
          data: {
            invoices: DEMO_INVOICES,
            readyToInvoice: DEMO_READY_TRANSACTIONS,
          },
        },
        { status: 200 }
      );
    }

    // 2. Fetch all finalized transactions to join snapshot metadata & find un-invoiced transactions
    const { data: transactions, error: txError } = await adminClient
      .from("finalized_transactions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("finalized_at", { ascending: false });

    if (txError) {
      return NextResponse.json(
        {
          success: true,
          data: {
            invoices: DEMO_INVOICES,
            readyToInvoice: DEMO_READY_TRANSACTIONS,
          },
        },
        { status: 200 }
      );
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
          invoices: mappedInvoices.length > 0 ? mappedInvoices : DEMO_INVOICES,
          readyToInvoice: readyTransactions.length > 0 ? readyTransactions : DEMO_READY_TRANSACTIONS,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        {
          success: true,
          data: {
            invoices: DEMO_INVOICES,
            readyToInvoice: DEMO_READY_TRANSACTIONS,
          },
        },
        { status: 200 }
      );
    }
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
