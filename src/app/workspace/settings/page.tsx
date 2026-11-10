"use client";

import React, { useState } from "react";
import {
  Building,
  ShieldCheck,
  CreditCard,
  Bell,
  CheckCircle2,
  Save,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DEMO_WORKSPACE_INFO } from "@/data/mockData";

type SettingsTab = "organization" | "thresholds" | "paypal" | "notifications";

export default function SettingsPage() {
  const { success, info } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>("organization");

  // Editable settings form states
  const [orgName, setOrgName] = useState(DEMO_WORKSPACE_INFO.name);
  const [discountThreshold, setDiscountThreshold] = useState("10.00%");
  const [paymentTermsDefault, setPaymentTermsDefault] = useState("Net 30");
  const [sandboxId, setSandboxId] = useState("PP-MERCH-88412");
  const [autoApproveMatches, setAutoApproveMatches] = useState(true);

  const handleSave = () => {
    success(
      "Settings Saved Successfully",
      "Organization parameters and commercial thresholds updated in local workspace state."
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Workspace Settings"
        subtitle="Manage organization profiles, commercial guardrails, approval thresholds, and PayPal payment gateway configurations."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="w-4 h-4" />}
            onClick={handleSave}
          >
            Save changes
          </Button>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-border flex items-center px-4 pt-2 overflow-x-auto gap-2 bg-[#FAFAF8]">
          {[
            { id: "organization", label: "Organization Profile", icon: Building },
            { id: "thresholds", label: "Commercial Guardrails", icon: ShieldCheck },
            { id: "paypal", label: "PayPal Gateway (Sandbox)", icon: CreditCard },
            { id: "notifications", label: "Alert Routing", icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`pb-3 px-3.5 text-xs font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-content-muted hover:text-content-primary"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "organization" && (
            <div className="max-w-2xl space-y-5 text-xs">
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-1">
                  Enterprise Commercial Identity
                </h3>
                <p className="text-content-secondary text-[11px]">
                  Public merchant identity presented on commercial agreements and purchase order reconciliations.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    Merchant Organization Name
                  </label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-content-primary block">
                      Operating Currency
                    </label>
                    <input
                      type="text"
                      defaultValue="USD ($) — United States Dollar"
                      readOnly
                      className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-secondary text-xs outline-none cursor-not-allowed font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-content-primary block">
                      Entity Tax ID / EIN
                    </label>
                    <input
                      type="text"
                      defaultValue="XX-XXX9281 (Delaware Corp)"
                      readOnly
                      className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-secondary text-xs outline-none cursor-not-allowed font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    Authorized Finance Administrator
                  </label>
                  <div className="p-3 bg-app rounded-md border border-border flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-content-primary">
                        {DEMO_WORKSPACE_INFO.user.name} ({DEMO_WORKSPACE_INFO.user.role})
                      </p>
                      <p className="text-[11px] text-content-muted">
                        {DEMO_WORKSPACE_INFO.user.email} • {DEMO_WORKSPACE_INFO.user.department}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Primary Signatory
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "thresholds" && (
            <div className="max-w-2xl space-y-5 text-xs">
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-1">
                  Commercial Validation Guardrails
                </h3>
                <p className="text-content-secondary text-[11px]">
                  Configure tolerance thresholds that automatically flag incoming purchase orders as conflicts.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    Maximum Discretionary Discount Threshold
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={discountThreshold}
                      onChange={(e) => setDiscountThreshold(e.target.value)}
                      className="w-32 px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono font-medium"
                    />
                    <span className="text-content-secondary text-[11px]">
                      Discounts exceeding this threshold require manual commercial review.
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    Standard Settlement Terms Default
                  </label>
                  <select
                    value={paymentTermsDefault}
                    onChange={(e) => setPaymentTermsDefault(e.target.value)}
                    className="w-48 px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
                  >
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days (Standard)</option>
                    <option value="Net 45">Net 45 Days</option>
                    <option value="Net 60">Net 60 Days</option>
                  </select>
                </div>

                <div className="p-3.5 bg-app border border-border rounded-md flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-content-primary block">
                      Automatic Approval for Exact Clause Matches
                    </span>
                    <span className="text-[11px] text-content-muted">
                      Immediately mark purchase orders with 0 conflicts as ready to invoice.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoApproveMatches}
                    onChange={(e) => setAutoApproveMatches(e.target.checked)}
                    className="w-4 h-4 accent-primary rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "paypal" && (
            <div className="max-w-2xl space-y-5 text-xs">
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-1">
                  PayPal Commercial Invoicing Gateway
                </h3>
                <p className="text-content-secondary text-[11px]">
                  Simulated sandbox credentials for automated digital billing generation (Module 2 integration point).
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-semibold block">
                      Sandbox Gateway Connected (Simulated)
                    </span>
                    <span className="text-[11px] text-emerald-700">
                      Live OAuth and Webhook listeners will connect in Module 2.
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300">
                  SANDBOX
                </span>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    PayPal Merchant ID
                  </label>
                  <input
                    type="text"
                    value={sandboxId}
                    onChange={(e) => setSandboxId(e.target.value)}
                    className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-content-primary block">
                    API Client Secret (Masked)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value="••••••••••••••••••••••••••••••••"
                      readOnly
                      className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-secondary text-xs outline-none cursor-not-allowed font-mono"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => info("Simulated credential rotate event logged.")}
                    >
                      Rotate
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="max-w-2xl space-y-5 text-xs">
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-1">
                  Alert Routing & Commercial Escalate Policies
                </h3>
                <p className="text-content-secondary text-[11px]">
                  Configure alert notifications for procurement officers and finance controllers.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  {
                    title: "Contractual Variance Alerts",
                    desc: "Notify immediately when an inbound PO requests discounts or quantities outside agreement tiers.",
                    defaultChecked: true,
                  },
                  {
                    title: "Counteroffer Transmissions",
                    desc: "Alert procurement officers upon dispatch and counterparty acceptance of counteroffers.",
                    defaultChecked: true,
                  },
                  {
                    title: "PayPal Gateway Settlement Webhooks",
                    desc: "Notify finance ops when invoice settlements are confirmed via digital gateway.",
                    defaultChecked: true,
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-app border border-border rounded-md flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-content-primary block">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-content-muted">
                        {item.desc}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked={item.defaultChecked}
                      className="w-4 h-4 accent-primary rounded cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-[#FAFAF8] flex items-center justify-between text-xs text-content-muted">
          <span>Environment: Demonstration Workspace v1.1</span>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
