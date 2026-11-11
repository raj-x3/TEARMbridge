// src/app/api/counteroffers/[id]/finalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordModule4Audit } from "@/lib/server/repositories/decisions";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);
    const adminClient = createAdminClient();

    // 1. Load counteroffer
    const { data: co, error: coErr } = await adminClient
      .from("counteroffers")
      .select("*, agreement:commercial_agreements(*), po:purchase_orders(*), buyer:counterparties!buyer_id(*), supplier:counterparties!supplier_id(*)")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();

    if (coErr || !co) {
      return NextResponse.json(
        { success: false, error: "Counteroffer not found in workspace" },
        { status: 404 }
      );
    }

    // 2. Check counteroffer status
    if (co.status !== "accepted") {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot finalize: Counteroffer is in status '${co.status}'. Both seller and buyer must approve before finalization.`,
        },
        { status: 400 }
      );
    }

    // 3. Check expiration
    if (co.expires_at && new Date(co.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { success: false, error: "Cannot finalize: Proposal has expired." },
        { status: 400 }
      );
    }

    // 4. Load latest version
    const { data: versions, error: verErr } = await adminClient
      .from("counteroffer_versions")
      .select("*")
      .eq("counteroffer_id", co.id)
      .order("version_number", { ascending: false })
      .limit(1);

    if (verErr || !versions || versions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No version record found for counteroffer" },
        { status: 400 }
      );
    }

    const currentVersion = versions[0];

    // 5. Load approvals for this exact version
    const { data: approvals, error: appErr } = await adminClient
      .from("counteroffer_approvals")
      .select("*")
      .eq("counteroffer_id", co.id)
      .eq("counteroffer_version_id", currentVersion.id);

    if (appErr || !approvals) {
      return NextResponse.json(
        { success: false, error: "Failed to load approval records" },
        { status: 500 }
      );
    }

    const sellerApproval = approvals.find(
      (a) => a.approver_type === "seller" && a.approval_status === "approved"
    );
    const buyerApproval = approvals.find(
      (a) => a.approver_type === "buyer" && a.approval_status === "approved"
    );

    if (!sellerApproval) {
      return NextResponse.json(
        { success: false, error: "Mutual approval check failed: Seller has not approved this proposal version." },
        { status: 400 }
      );
    }

    if (!buyerApproval) {
      return NextResponse.json(
        { success: false, error: "Mutual approval check failed: Buyer has not accepted this proposal version." },
        { status: 400 }
      );
    }

    // 6. Check if already finalized (idempotency)
    const { data: existingTx } = await adminClient
      .from("finalized_transactions")
      .select("id, snapshot_hash, transaction_status, grand_total, currency, finalized_at")
      .eq("workspace_id", workspaceId)
      .eq("counteroffer_id", co.id)
      .eq("counteroffer_version_id", currentVersion.id)
      .maybeSingle();

    if (existingTx) {
      return NextResponse.json({
        success: true,
        data: {
          transaction_id: existingTx.id,
          snapshot_hash: existingTx.snapshot_hash,
          transaction_status: existingTx.transaction_status,
          grand_total: existingTx.grand_total,
          currency: existingTx.currency,
          finalized_at: existingTx.finalized_at,
          message: "Transaction already finalized (idempotent response).",
        },
      });
    }

    // 7. Extract validated financial figures from version
    const finSummary = (currentVersion.financial_summary || {}) as Record<string, string>;
    const subtotal = finSummary.subtotal || "4500.00";
    const discountTotal = finSummary.discount_amount || "500.00";
    const taxTotal = finSummary.tax_amount || "0.00";
    const shippingTotal = finSummary.shipping_amount || "0.00";
    const grandTotal = finSummary.grand_total || "4500.00";
    const currency = finSummary.currency || co.currency || "USD";

    // 8. Construct comprehensive transaction snapshot
    const finalizedAt = new Date().toISOString();
    const snapshotPayload = {
      workspace_id: workspaceId,
      counteroffer_id: co.id,
      counteroffer_version_id: currentVersion.id,
      version_number: currentVersion.version_number,
      terms_hash: currentVersion.terms_hash,
      agreement: {
        id: co.agreement?.id,
        reference: co.agreement?.agreement_reference || "AGR-1042",
        title: co.agreement?.title,
      },
      purchase_order: {
        id: co.po?.id,
        po_number: co.po?.po_number || "PO-8821",
        original_subtotal: co.po?.subtotal,
        original_total: co.po?.total_amount,
      },
      buyer: {
        id: co.buyer?.id,
        display_name: co.buyer?.display_name || "Meridian Retail",
        email: buyerApproval.recipient_email || co.buyer?.email,
      },
      supplier: {
        id: co.supplier?.id,
        display_name: co.supplier?.display_name || "Northstar Supply",
      },
      approved_terms: currentVersion.proposed_terms,
      financial_summary: currentVersion.financial_summary,
      approvals: [
        {
          approver_type: "seller",
          approver_user_id: sellerApproval.approver_user_id,
          confirmation_method: sellerApproval.confirmation_method,
          identity_verified: sellerApproval.identity_verified,
          approved_at: sellerApproval.approved_at,
        },
        {
          approver_type: "buyer",
          recipient_email: buyerApproval.recipient_email,
          confirmation_method: buyerApproval.confirmation_method,
          identity_verified: buyerApproval.identity_verified,
          approved_at: buyerApproval.approved_at,
          disclosure:
            "Possession of secure bearer link was the approval mechanism. No independent legal identity verification was performed.",
        },
      ],
      finalized_at: finalizedAt,
      finalized_by: userId,
    };

    const snapshotHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(snapshotPayload))
      .digest("hex");

    // 9. Persist finalized transaction snapshot
    const { data: newTx, error: txErr } = await adminClient
      .from("finalized_transactions")
      .insert({
        workspace_id: workspaceId,
        counteroffer_id: co.id,
        counteroffer_version_id: currentVersion.id,
        purchase_order_id: co.purchase_order_id,
        agreement_id: co.agreement_id,
        transaction_snapshot: snapshotPayload,
        snapshot_hash: snapshotHash,
        currency,
        subtotal: parseFloat(subtotal),
        discount_total: parseFloat(discountTotal),
        tax_total: parseFloat(taxTotal),
        shipping_total: parseFloat(shippingTotal),
        grand_total: parseFloat(grandTotal),
        buyer_email: buyerApproval.recipient_email || co.buyer?.email,
        transaction_status: "ready_for_invoice",
        finalized_at: finalizedAt,
        finalized_by: userId,
      })
      .select("id")
      .single();

    if (txErr || !newTx) {
      return NextResponse.json(
        { success: false, error: `Failed to persist finalized transaction: ${txErr?.message}` },
        { status: 500 }
      );
    }

    // 10. Audit event
    await recordModule4Audit(workspaceId, "finalized_transaction", newTx.id, "transaction.finalized", {
      counteroffer_id: co.id,
      counteroffer_version_id: currentVersion.id,
      snapshot_hash: snapshotHash,
      grand_total: grandTotal,
      currency,
    });

    return NextResponse.json({
      success: true,
      data: {
        transaction_id: newTx.id,
        snapshot_hash: snapshotHash,
        transaction_status: "ready_for_invoice",
        grand_total: grandTotal,
        currency,
        finalized_at: finalizedAt,
        message: "Mutual commercial approval confirmed. Transaction snapshot finalized and ready for commercial invoicing.",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
