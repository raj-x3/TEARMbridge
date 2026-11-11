// src/app/api/purchase-orders/[id]/counteroffers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCommercialRules } from "@/lib/server/repositories/commercial-rules";
import { generateCounteroffer } from "@/lib/server/intelligence/counteroffer-generator";
import { evaluateRules } from "@/lib/server/intelligence/rules-engine";
import { saveCounteroffer } from "@/lib/server/repositories/decisions";
import { parseToCents } from "@/lib/server/intelligence/commercial-validator";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);
    const adminClient = createAdminClient();

    // 1. Resolve purchase order
    const { data: po, error: poErr } = await adminClient
      .from("purchase_orders")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", params.id)
      .single();

    if (poErr || !po) {
      return NextResponse.json(
        { success: false, error: "Purchase order not found in workspace" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let decisionId = body.decision_id;
    const agreementId = po.linked_agreement_id || body.agreement_id;

    if (!agreementId) {
      return NextResponse.json(
        { success: false, error: "No commercial agreement linked to this purchase order" },
        { status: 400 }
      );
    }

    // 2. Resolve commercial decision
    if (!decisionId) {
      const { data: latestDecision } = await adminClient
        .from("commercial_decisions")
        .select("id, analysis_run_id")
        .eq("workspace_id", workspaceId)
        .eq("agreement_id", agreementId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      decisionId = latestDecision?.id;
    }

    if (!decisionId) {
      return NextResponse.json(
        { success: false, error: "No commercial decision found. Run agreement evaluation first." },
        { status: 400 }
      );
    }

    // Load decision
    const { data: decision } = await adminClient
      .from("commercial_decisions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", decisionId)
      .single();

    const analysisRunId = decision?.analysis_run_id || body.analysis_run_id;

    // Load analysis findings
    const { data: findings } = await adminClient
      .from("analysis_findings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("analysis_run_id", analysisRunId);

    // Load commercial rules
    const rules = await getCommercialRules(workspaceId);

    // Load PO line items
    const { data: lineItems } = await adminClient
      .from("purchase_order_line_items")
      .select("*")
      .eq("purchase_order_id", po.id);

    // Extract original terms from PO & findings
    let quantity = 45;
    let unitPriceCents = 10000;
    let discountPercent = 15.0;
    let paymentTermDays = 60;
    let paymentTermLabel = "Net 60";
    let deliveryDays = 3;
    let productName = "Commercial Fulfillment Order";

    if (lineItems && lineItems.length > 0) {
      const item = lineItems[0];
      if (item.product_name) productName = item.product_name;
      if (item.unit_price) unitPriceCents = parseToCents(item.unit_price);
    }

    // Scan findings for exact PO request terms
    for (const f of findings || []) {
      const expl = f.explanation || "";

      // Unit price match: "unit price of $100.00 USD matches"
      const priceMatch = expl.match(/(?:unit\s+price\s+of\s+\$|Contract\s+Unit\s+Price:\s*\$|price:?\s*\$)(\d+(?:\.\d+)?)/i);
      if (priceMatch) {
        unitPriceCents = parseToCents(priceMatch[1]);
      }

      const qtyMatch = expl.match(/(?:requested\s+order\s+quantity\s+of|requested\s+quantity:?\s*)(\d+)\s*units?/i);
      if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);

      const discountMatch = expl.match(/(\d+(?:\.\d+)?)\s*%\s*(?:promotional\s+discount|discount)/i);
      if (discountMatch) discountPercent = parseFloat(discountMatch[1]);

      const payMatch = expl.match(/requests\s+Net\s*(\d+)/i);
      if (payMatch) {
        paymentTermDays = parseInt(payMatch[1], 10);
        paymentTermLabel = `Net ${payMatch[1]}`;
      }

      const delMatch = expl.match(/within\s*(\d+)\s*business\s*days/i);
      if (delMatch) deliveryDays = parseInt(delMatch[1], 10);
    }

    const ruleResults = evaluateRules(rules, {
      quantity,
      unitPrice: unitPriceCents,
      discountPercent,
      paymentTermDays,
      deliveryDays,
      currency: po.currency || "USD",
      transactionValueCents: parseToCents(po.total_amount),
    });

    // 3. Generate rule-validated counteroffer
    const proposal = generateCounteroffer({
      workspaceId,
      rules,
      findings: findings || [],
      originalTerms: {
        quantity,
        unit_price_cents: unitPriceCents,
        discount_percent: discountPercent,
        payment_term_label: paymentTermLabel,
        payment_term_days: paymentTermDays,
        delivery_days: deliveryDays,
        currency: po.currency || "USD",
        product_name: productName,
        tax_amount_cents: parseToCents(po.tax_amount),
        shipping_amount_cents: parseToCents(po.shipping_amount),
      },
      ruleResults,
    });

    if (!proposal.available) {
      return NextResponse.json(
        { success: false, error: proposal.no_proposal_reason || "No counteroffer available under current rules" },
        { status: 400 }
      );
    }

    // 4. Save counteroffer + version 1
    const { counterofferId, versionId } = await saveCounteroffer({
      workspaceId,
      decisionId,
      agreementId,
      purchaseOrderId: po.id,
      buyerId: po.buyer_id,
      supplierId: po.supplier_id,
      currency: proposal.proposed_terms!.currency,
      proposedTerms: proposal.proposed_terms as unknown as Record<string, unknown>,
      originalTerms: proposal.original_terms as unknown as Record<string, unknown>,
      financialSummary: proposal.financial_summary as unknown as Record<string, unknown>,
      termsHash: proposal.terms_hash,
      explanation: proposal.explanation,
      termChanges: proposal.term_changes,
      createdBy: userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        counteroffer_id: counterofferId,
        version_id: versionId,
        terms_hash: proposal.terms_hash,
        proposed_terms: proposal.proposed_terms,
        financial_summary: proposal.financial_summary,
        term_changes: proposal.term_changes,
        explanation: proposal.explanation,
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
