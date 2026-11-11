// src/lib/server/repositories/commercial-rules.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCommercialRules(workspaceId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("commercial_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("priority", { ascending: true });

  if (error) throw new Error(`Failed to fetch commercial rules: ${error.message}`);
  return data || [];
}
