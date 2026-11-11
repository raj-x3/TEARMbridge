// src/lib/server/repositories/counterparties.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CreateCounterpartyInput } from "@/lib/server/validation/counterparty";

export async function getCounterparties(workspaceId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("counterparties")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch counterparties: ${error.message}`);
  return data || [];
}

export async function createCounterparty(
  workspaceId: string,
  input: CreateCounterpartyInput,
  _userId?: string
) {
  void _userId;
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("counterparties")
    .insert({
      workspace_id: workspaceId,
      legal_name: input.legal_name,
      display_name: input.display_name,
      entity_type: input.entity_type,
      email: input.email || null,
      phone: input.phone || null,
      country: input.country || null,
      currency: input.currency,
      notes: input.notes || null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create counterparty: ${error.message}`);

  // Note: Audit event is automatically recorded within the same database transaction
  // by the database trigger trg_audit_counterparty_creation (SECURITY DEFINER).
  return data;
}
