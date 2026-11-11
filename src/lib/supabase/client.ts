// src/lib/supabase/client.ts
// Browser-side Supabase client using cookie-based auth via @supabase/ssr
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrl, getSupabasePublishableKey } from "@/lib/config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    getSupabaseUrl(),
    getSupabasePublishableKey()
  );

  return browserClient;
}
