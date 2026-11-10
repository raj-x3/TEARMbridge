"use client";

import React, { useState, useEffect } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CommandSearch } from "@/components/ui/CommandSearch";
import { ImportPOModal } from "@/components/modals/ImportPOModal";
import { ToastProvider } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [commandSearchOpen, setCommandSearchOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  // Global keyboard shortcut listener for Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-app text-content-primary flex">
        {/* Sidebar */}
        <AppSidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          onOpenHelp={() => setHelpModalOpen(true)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-[248px]">
          <AppTopbar
            onOpenSearch={() => setCommandSearchOpen(true)}
            onOpenMobileMenu={() => setMobileSidebarOpen(true)}
            onOpenImportModal={() => setImportModalOpen(true)}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        {/* Global Overlays */}
        <CommandSearch
          isOpen={commandSearchOpen}
          onClose={() => setCommandSearchOpen(false)}
        />

        <ImportPOModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
        />

        {/* Settings Modal */}
        <Modal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          title="Organization & Financial Settings"
          description="Configure enterprise validation thresholds, PayPal payment credentials, and approval routing."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-app rounded border border-border">
              <span className="font-semibold text-content-primary block mb-1">
                Active Organization: Northstar Supply
              </span>
              <p className="text-content-secondary">
                Entity ID: ORG-US-99214 • Operating Currency: USD • Settlement Mode: PayPal Enterprise Invoicing Gateway
              </p>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-content-primary block">
                Discretionary Discount Approval Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  defaultValue="10.00%"
                  readOnly
                  className="bg-app border border-border rounded px-3 py-1.5 text-content-primary font-mono w-24"
                />
                <span className="text-content-muted">
                  Requires 2-tier managerial signoff above this margin.
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-medium text-content-primary block">
                PayPal Merchant Gateway Status
              </label>
              <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
                <span>Sandbox Invoicing Sandbox Connected</span>
                <span className="font-mono text-[10px]">ID: PP-MERCH-88412</span>
              </div>
            </div>
            <div className="flex justify-end pt-3 border-t border-border-subtle">
              <Button variant="secondary" onClick={() => setSettingsModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>

        {/* Help & Docs Modal */}
        <Modal
          isOpen={helpModalOpen}
          onClose={() => setHelpModalOpen(false)}
          title="TERMBridge Help & Documentation"
          description="Understanding the commercial agreement to payment pipeline."
        >
          <div className="space-y-3 text-xs text-content-secondary leading-relaxed">
            <p>
              <strong>TERMBridge Core Journey:</strong>
            </p>
            <div className="p-3 bg-app rounded border border-border font-mono text-[11px] text-content-primary">
              Purchase Order → Contract Interpretation → Commercial Validation → Negotiation → Mutual Approval → PayPal Invoice → Payment Tracking
            </div>
            <p>
              <strong>Commercial Validation:</strong> Each incoming purchase order is automatically cross-referenced against the Master Supplier Agreement and any active addenda. Any discrepancy in unit pricing, quantity tiers, discounts, delivery timelines, or payment terms is surfaced as a conflict.
            </p>
            <p>
              <strong>Counteroffers:</strong> When terms conflict with contracted guardrails, finance administrators can issue structured counteroffers that adjust volume or settlement terms to maintain required commercial margins.
            </p>
            <div className="flex justify-end pt-3 border-t border-border-subtle">
              <Button variant="primary" onClick={() => setHelpModalOpen(false)}>
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </ToastProvider>
  );
}
