"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/workspace/overview";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!configured) {
      // In demo mode, bypass signin directly to workspace
      router.push(redirectPath);
      return;
    }

    if (!email || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Invalid commercial credentials.");
      } else {
        router.push(redirectPath);
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication service unavailable.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sm:mx-auto sm:w-full sm:max-w-md">
      {/* Brand Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#171A20] text-white text-xs font-mono font-medium tracking-wide mb-4">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>TERMBRIDGE</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-content-primary">
          Commercial Workspace Access
        </h2>
        <p className="mt-1.5 text-xs text-content-secondary">
          From agreement to payment. Enterprise transaction validation.
        </p>
      </div>

      {/* Mode Status Indicator */}
      <div className="mt-6">
        {!configured ? (
          <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E]">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Demo Mode Active</span>
                <p className="text-[11px] leading-relaxed text-[#78350F]">
                  Supabase credentials are not currently configured in the environment. You can explore the complete application with canonical demo data.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Production Supabase PostgreSQL & Auth Connected</span>
          </div>
        )}
      </div>

      {/* Form Card */}
      <div className="mt-4 bg-surface py-8 px-6 border border-border rounded-xl shadow-card sm:px-10">
        <form className="space-y-4" onSubmit={handleSignIn}>
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-content-primary mb-1.5">
              Corporate Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-content-muted absolute left-3 top-2.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={configured ? "name@company.com" : "demo@northstar-supply.com"}
                className="w-full pl-9 pr-3 py-2 text-xs bg-app border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                disabled={!configured}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-content-primary mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-content-muted absolute left-3 top-2.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs bg-app border border-border rounded-lg text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                disabled={!configured}
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              isLoading={isLoading}
              icon={!isLoading ? <ArrowRight className="w-4 h-4" /> : undefined}
            >
              {configured ? "Authenticate & Enter Workspace" : "Enter Demo Workspace"}
            </Button>
          </div>
        </form>

        {/* Seed account reminder */}
        {configured && (
          <div className="mt-6 pt-4 border-t border-border-subtle text-center">
            <p className="text-[11px] text-content-muted">
              Demo user can be seeded via{" "}
              <code className="font-mono text-[10px] bg-app px-1.5 py-0.5 rounded border border-border">
                npm run db:seed
              </code>
            </p>
          </div>
        )}
      </div>

      {/* Security Disclaimers */}
      <div className="mt-6 text-center text-[11px] text-content-muted flex items-center justify-center gap-1.5 font-mono">
        <ShieldCheck className="w-3.5 h-3.5 text-content-secondary" />
        <span>Role-Based Access Control & Financial Data Isolation Enforced</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-app flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-primary-subtle">
      <Suspense fallback={<div className="text-center text-xs text-content-muted">Loading workspace authentication...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
