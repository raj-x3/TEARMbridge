// src/lib/server/repositories/agreements.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getAgreements(workspaceId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("commercial_agreements")
    .select(`
      *,
      buyer:buyer_id(id, display_name, legal_name),
      supplier:supplier_id(id, display_name, legal_name),
      purchase_orders:purchase_orders(id, po_number, total_amount, status)
    `)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch agreements: ${error.message}`);
  return data || [];
}

export async function getAgreementByReferenceOrId(
  workspaceId: string,
  identifier: string
) {
  const supabase = createServerSupabaseClient();

  // Try matching by agreement_reference first (e.g. "AGR-1042"), then by UUID id
  let query = supabase
    .from("commercial_agreements")
    .select(`
      *,
      buyer:buyer_id(id, display_name, legal_name, email),
      supplier:supplier_id(id, display_name, legal_name, email),
      versions:agreement_versions(*),
      terms:agreement_terms(*),
      purchase_orders:purchase_orders(*, line_items:purchase_order_line_items(*))
    `)
    .eq("workspace_id", workspaceId);

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  if (isUUID) {
    query = query.eq("id", identifier);
  } else {
    query = query.eq("agreement_reference", identifier);
  }

  const { data: agreement, error } = await query.maybeSingle();
  if (error) throw new Error(`Failed to fetch agreement: ${error.message}`);
  if (!agreement) return null;

  // Fetch associated documents via document_links
  const { data: documentLinks } = await supabase
    .from("document_links")
    .select(`
      id,
      relationship_type,
      document:document_id(*)
    `)
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "agreement")
    .eq("entity_id", agreement.id);

  // Also fetch related audit events
  const { data: auditEvents } = await supabase
    .from("audit_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("entity_id", agreement.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    ...agreement,
    documents: documentLinks || [],
    audit_events: auditEvents || [],
  };
}
