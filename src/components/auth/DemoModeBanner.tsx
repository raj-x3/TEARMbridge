"use client";

import React, { useState, useEffect } from "react";
import { Database, X } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/config";

export const DemoModeBanner: React.FC = () => {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  if (configured === null || configured === true || dismissed) {
    return null;
  }

  return (
    <>
      <div className="bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2 text-xs text-[#92400E] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
          <span className="font-semibold shrink-0">Demo mode</span>
          <span className="text-[#B45309] hidden sm:inline truncate">
            — Database not connected. Displaying read-only commercial mock data. Configure Supabase in .env.local to enable real persistence & document storage.
          </span>
          <button
            onClick={() => setShowDetails(true)}
            className="underline font-medium hover:text-[#78350F] text-[11px] shrink-0 ml-1"
          >
            Setup instructions
          </button>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-[#B45309] hover:text-[#78350F] p-0.5 rounded"
          aria-label="Dismiss banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl shadow-modal max-w-lg w-full p-6 text-xs text-content-primary space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-content-primary">
                  Supabase Setup Guide
                </h3>
                <p className="text-[11px] text-content-secondary mt-0.5">
                  Connect PostgreSQL, Auth, and Storage to enable database mode.
                </p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="text-content-muted hover:text-content-primary p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-[11px] bg-app p-3 rounded-lg border border-border">
              <p className="text-content-secondary font-sans">
                1. Copy <code className="bg-white px-1 py-0.5 rounded border border-border">.env.example</code> to <code className="bg-white px-1 py-0.5 rounded border border-border">.env.local</code>
              </p>
              <p className="text-content-secondary font-sans">
                2. Set <code className="bg-white px-1 py-0.5 rounded border border-border">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="bg-white px-1 py-0.5 rounded border border-border">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
              </p>
              <p className="text-content-secondary font-sans">
                3. Run SQL migrations in <code className="bg-white px-1 py-0.5 rounded border border-border">supabase/migrations/</code> on your Supabase dashboard
              </p>
              <p className="text-content-secondary font-sans">
                4. Create a private bucket named <code className="bg-white px-1 py-0.5 rounded border border-border">termbridge-documents</code>
              </p>
              <p className="text-content-secondary font-sans">
                5. Run <code className="bg-white px-1 py-0.5 rounded border border-border">npm run db:seed</code> to populate the canonical demo dataset
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowDetails(false)}
                className="px-3 py-1.5 rounded-md bg-app hover:bg-[#EFEFEA] border border-border text-xs font-medium text-content-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
