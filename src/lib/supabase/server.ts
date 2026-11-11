// src/lib/supabase/server.ts
// Server-side Supabase client for Route Handlers, Server Components, and Server Actions
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabasePublishableKey } from "@/lib/config";

export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method is called from a Server Component where
          // cookies cannot be set. This can be safely ignored when the
          // middleware is refreshing sessions.
        }
      },
    },
  });
}
