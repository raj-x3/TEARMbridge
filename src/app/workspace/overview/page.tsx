"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { AttentionQueue } from "@/components/overview/AttentionQueue";
import { RecentTransactionsTable } from "@/components/overview/RecentTransactionsTable";
import { ActivityTimelinePanel } from "@/components/overview/ActivityTimelinePanel";
import { ImportPOModal } from "@/components/modals/ImportPOModal";
import { getDerivedKPICards, DEMO_WORKSPACE_INFO } from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/config";
import { formatCurrency } from "@/lib/utils";

export default function OverviewPage() {
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [kpiCards, setKpiCards] = useState(getDerivedKPICards());
  const [merchantName, setMerchantName] = useState(DEMO_WORKSPACE_INFO.name);

  useEffect(() => {
    const isConf = isSupabaseConfigured();

    if (isConf) {
      fetch("/api/workspace/overview")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            const m = data.data.metrics;
            if (m) {
              setKpiCards([
                {
                  id: "review",
                  label: "Agreements in review",
                  value: String(m.agreementsInReviewCount).padStart(2, "0"),
                  subtext: `${m.agreementsInReviewCount} commercial conflicts flagged`,
                  status: "attention",
                },
                {
                  id: "counterparty",
                  label: "Awaiting counterparty",
                  value: String(m.awaitingCounterpartyCount).padStart(2, "0"),
                  subtext: "Avg. response time: 4.2 hours",
                  status: "neutral",
                },
                {
                  id: "invoice",
                  label: "Ready to invoice",
                  value: String(m.readyToInvoiceCount).padStart(2, "0"),
                  subtext: "Terms validated and approved",
                  status: "ready",
                },
                {
                  id: "outstanding",
                  label: "Outstanding value",
                  value: formatCurrency(m.outstandingValue),
                  subtext: `Across ${m.activeFlowsCount} active commercial flows`,
                  status: "primary",
                },
              ]);
            }
            if (data.data.workspace?.name) {
              setMerchantName(data.data.workspace.name);
            }
          }
        })
        .catch((err) => console.error("Error loading overview data:", err));
    }
  }, []);

  return (
    <div className="space-y-7">
      {/* Demo Workspace Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-surface border border-border rounded-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-content-primary">
              {DEMO_WORKSPACE_INFO.environment}
            </span>
            <span className="text-content-secondary hidden sm:inline">
              {" "}
              — Fictional seed data representing live commercial agreement workflows.
            </span>
          </div>
        </div>
        <div className="text-[11px] font-mono text-content-muted">
          Active Merchant: <span className="text-content-primary font-medium">{merchantName}</span>
        </div>
      </div>

      {/* Page Header with non-time-specific greeting */}
      <PageHeader
        title="Welcome back, Alex"
        subtitle="Here's what needs your attention across commercial agreements and payments."
        actions={
          <>
            <Link href="/workspace/agreements">
              <Button variant="secondary" size="sm">
                View all agreements
              </Button>
            </Link>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setImportModalOpen(true)}
            >
              Import purchase order
            </Button>
          </>
        }
      />

      {/* Derived KPI Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <MetricCard
            key={kpi.id}
            label={kpi.label}
            value={kpi.value}
            subtext={kpi.subtext}
            badge={kpi.id === "review" ? "Action required" : undefined}
          />
        ))}
      </section>

      {/* Attention Queue */}
      <AttentionQueue />

      {/* Grid: Transactions Table (2 cols) & Activity Timeline (1 col) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <RecentTransactionsTable />
        </div>
        <div className="lg:col-span-1">
          <ActivityTimelinePanel />
        </div>
      </section>

      <ImportPOModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}
