// src/app/api/agreements/[id]/evaluate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/server/services/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgreementByReferenceOrId } from "@/lib/server/repositories/agreements";
import { getCommercialRules } from "@/lib/server/repositories/commercial-rules";
import { evaluateDecision } from "@/lib/server/intelligence/decision-engine";
import { saveDecision } from "@/lib/server/repositories/decisions";
import { RuleEvaluationInput } from "@/lib/server/intelligence/rules-engine";
import { parseToCents } from "@/lib/server/intelligence/commercial-validator";

export const dynamic = "force-dynamic";

/**
 * Helper to extract deterministic commercial values from analysis findings & PO data.
 */
function extractCommercialInput(
  findings: Array<{ id: string; term_key: string; explanation: string }>,
  po: Record<string, unknown>,
  lineItems: Array<Record<string, unknown>>
): RuleEvaluationInput {
  let quantity = 50; // default MOQ
  let discountPercent = 0;
  let paymentTermDays = 30;
  let deliveryDays = 7;
  let unitPriceCents = 10000; // $100.00
  const findingIds: Record<string, string> = {};

  // Try extracting from PO line items first
  if (lineItems && lineItems.length > 0) {
    const item = lineItems[0];
    if (typeof item.unit_price === "string" || typeof item.unit_price === "number") {
      unitPriceCents = parseToCents(item.unit_price);
    }
    if (typeof item.quantity === "number") {
      quantity = item.quantity;
    }
  }

  // Scan findings for precise discrepancy descriptions
  for (const f of findings) {
    const expl = f.explanation || "";

    // Unit price match: "unit price of $100.00 USD matches"
    const priceMatch = expl.match(/(?:unit\s+price\s+of\s+\$|Contract\s+Unit\s+Price:\s*\$|price:?\s*\$)(\d+(?:\.\d+)?)/i);
    if (priceMatch) {
      unitPriceCents = parseToCents(priceMatch[1]);
    }

    // Quantity mismatch: "order quantity of 45 units is below... 50 units"
    const qtyMatch = expl.match(/(?:order\s+quantity\s+of|requested\s+quantity:?\s*)(\d+)\s*units?/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
      findingIds["quantity_mismatch"] = f.id;
    }

    // Discount mismatch: "unauthorized 15% promotional discount"
    const discountMatch = expl.match(/(\d+(?:\.\d+)?)\s*%\s*(?:promotional\s+discount|discount)/i);
    if (discountMatch) {
      discountPercent = parseFloat(discountMatch[1]);
      findingIds["discount_unauthorized"] = f.id;
    }

    // Payment term conflict: "requests Net 60 days"
    const paymentMatch = expl.match(/(?:requests\s+)?Net\s*(\d+)/i);
    if (paymentMatch) {
      paymentTermDays = parseInt(paymentMatch[1], 10);
      findingIds["payment_term_conflict"] = f.id;
    }

    // Delivery conflict: "within 3 business days"
    const deliveryMatch = expl.match(/within\s*(\d+)\s*business\s*days/i);
    if (deliveryMatch) {
      deliveryDays = parseInt(deliveryMatch[1], 10);
      findingIds["delivery_window_conflict"] = f.id;
    }

    if (f.term_key === "conflict") {
      findingIds["conflict"] = f.id;
    }
  }

  // Transaction value: from PO or computed
  const totalAmountStr = (po?.total_amount as string) || "4500.00";
  const transactionValueCents = parseToCents(totalAmountStr);
  const currency = (po?.currency as string) || "USD";

  return {
    quantity,
    unitPrice: unitPriceCents,
    discountPercent,
    paymentTermDays,
    deliveryDays,
    currency,
    transactionValueCents,
    findingIds,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { workspaceId, userId } = await requireAuth(["owner", "admin", "finance"]);
    const adminClient = createAdminClient();

    const agreement = await getAgreementByReferenceOrId(workspaceId, params.id);
    if (!agreement) {
      return NextResponse.json(
        { success: false, error: "Agreement not found in workspace" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const purchaseOrderId = body.purchase_order_id;
    let analysisRunId = body.analysis_run_id;

    // Resolve analysis run
    if (!analysisRunId) {
      const { data: latestRun } = await adminClient
        .from("analysis_runs")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("agreement_id", agreement.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      analysisRunId = latestRun?.id;
    }

    if (!analysisRunId) {
      return NextResponse.json(
        { success: false, error: "No completed analysis run found for this agreement" },
        { status: 400 }
      );
    }

    // Resolve purchase order
    let poRecord: Record<string, unknown> = {};
    let lineItems: Array<Record<string, unknown>> = [];

    if (purchaseOrderId) {
      const { data: po } = await adminClient
        .from("purchase_orders")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", purchaseOrderId)
        .single();
      if (po) poRecord = po;

      const { data: items } = await adminClient
        .from("purchase_order_line_items")
        .select("*")
        .eq("purchase_order_id", purchaseOrderId);
      if (items) lineItems = items;
    } else {
      // Look up linked PO
      const { data: po } = await adminClient
        .from("purchase_orders")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("linked_agreement_id", agreement.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (po) {
        poRecord = po;
        const { data: items } = await adminClient
          .from("purchase_order_line_items")
          .select("*")
          .eq("purchase_order_id", po.id);
        if (items) lineItems = items;
      }
    }

    // Load analysis findings
    const { data: findings } = await adminClient
      .from("analysis_findings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("analysis_run_id", analysisRunId);

    // Load commercial rules
    const rules = await getCommercialRules(workspaceId);

    // Extract input deterministically
    const ruleInput = extractCommercialInput(findings || [], poRecord, lineItems);

    // Run Decision Engine
    const decision = evaluateDecision({
      workspaceId,
      agreementId: agreement.id,
      purchaseOrderId: (poRecord.id as string) || null,
      analysisRunId,
      findings: findings || [],
      rules,
      ruleInput,
    });

    // Save Decision to Database
    const decisionId = await saveDecision({
      workspaceId,
      agreementId: agreement.id,
      purchaseOrderId: (poRecord.id as string) || null,
      analysisRunId,
      decisionStatus: decision.decision_status,
      evaluationResults: decision.evaluation_results,
      applicableRuleVersions: decision.applicable_rule_versions,
      evaluatedBy: userId,
    });

    return NextResponse.json({
      success: true,
      data: {
        decision_id: decisionId,
        decision_status: decision.decision_status,
        summary: decision.summary,
        evaluation_results: decision.evaluation_results,
        blocked_reasons: decision.blocked_reasons,
        requires_counteroffer_reasons: decision.requires_counteroffer_reasons,
        requires_approval_reasons: decision.requires_approval_reasons,
        critical_findings: decision.critical_findings,
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
