// src/lib/server/repositories/workspace.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getWorkspaceOverview(workspaceId: string) {
  const supabase = createServerSupabaseClient();

  // 1. Get workspace details
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (wsError || !workspace) {
    throw new Error(`Workspace not found: ${wsError?.message}`);
  }

  // 2. Query agreements with stages to derive KPIs
  const { data: agreements, error: agrError } = await supabase
    .from("commercial_agreements")
    .select(`
      id,
      agreement_reference,
      title,
      status,
      currency,
      created_at,
      updated_at,
      buyer:buyer_id(id, display_name),
      supplier:supplier_id(id, display_name),
      purchase_orders(id, po_number, total_amount, status)
    `)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (agrError) throw new Error(`Failed to fetch agreements: ${agrError.message}`);

  // 3. Compute derived metrics mathematically
  const allAgreements = agreements || [];

  const inReview = allAgreements.filter((a) => a.status === "needs_review");
  const awaitingCounterparty = allAgreements.filter(
    (a) => a.status === "awaiting_counterparty" || a.status === "counteroffer_sent"
  );
  const readyToInvoice = allAgreements.filter((a) => a.status === "ready_to_invoice");
  const activeFlows = allAgreements.filter((a) => a.status !== "completed" && a.status !== "cancelled");

  // Calculate outstanding value from associated active purchase orders or fallback sum
  const outstandingValue = activeFlows.reduce((sum, a) => {
    const poTotal = (a.purchase_orders || []).reduce(
      (pSum: number, po: { total_amount?: number }) => pSum + (Number(po.total_amount) || 0),
      0
    );
    return sum + poTotal;
  }, 0);

  // 4. Fetch recent audit activity
  const { data: recentActivity } = await supabase
    .from("audit_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);

  return {
    workspace,
    metrics: {
      agreementsInReviewCount: inReview.length,
      awaitingCounterpartyCount: awaitingCounterparty.length,
      readyToInvoiceCount: readyToInvoice.length,
      activeFlowsCount: activeFlows.length,
      totalAgreementsCount: allAgreements.length,
      outstandingValue,
    },
    recentAgreements: allAgreements.slice(0, 10),
    recentActivity: recentActivity || [],
  };
}
