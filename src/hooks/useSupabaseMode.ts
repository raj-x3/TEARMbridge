"use client";

import { useState, useEffect } from "react";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/client";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";

export function useSupabaseMode() {
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const configured = isSupabaseConfigured();
    setIsConfigured(configured);

    if (configured) {
      try {
        const supabase = createClient();
        supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
          setUser(res.data.user);
          setLoading(false);
        });

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(
          (_event: AuthChangeEvent, session: Session | null) => {
            setUser(session?.user || null);
          }
        );

        return () => {
          subscription.unsubscribe();
        };
      } catch (err: unknown) {
        console.error("Supabase client init error:", err);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const signOut = async () => {
    if (isConfigured) {
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = "/login";
    }
  };

  return { isConfigured, user, loading, signOut };
}
