"use client";

import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { COUNTEROFFERS } from "@/data/mockData";
import { CounterofferRecord } from "@/types";

export default function CounteroffersPage() {
  const { success, error } = useToast();
  const [counteroffers, setCounteroffers] = useState<CounterofferRecord[]>(COUNTEROFFERS);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCO, setSelectedCO] = useState<CounterofferRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredCO = useMemo(() => {
    return counteroffers.filter((co) => {
      const matchQ =
        co.id.toLowerCase().includes(query.toLowerCase()) ||
        co.buyer.toLowerCase().includes(query.toLowerCase()) ||
        co.poNumber.toLowerCase().includes(query.toLowerCase()) ||
        co.proposedTerms.toLowerCase().includes(query.toLowerCase());
      const matchS = statusFilter === "all" || co.currentStatus === statusFilter;
      return matchQ && matchS;
    });
  }, [counteroffers, query, statusFilter]);

  const handleOpenDetail = (co: CounterofferRecord) => {
    setSelectedCO(co);
    setDrawerOpen(true);
  };

  const handleApprove = (id: string) => {
    setCounteroffers((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, currentStatus: "Accepted" } : item
      )
    );
    if (selectedCO && selectedCO.id === id) {
      setSelectedCO({ ...selectedCO, currentStatus: "Accepted" });
    }
    success(
      "Counteroffer Terms Accepted",
      `Proposal ${id} accepted in local state. Transaction ready for commercial invoicing.`
    );
  };

  const handleReject = (id: string) => {
    setCounteroffers((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, currentStatus: "Rejected" } : item
      )
    );
    if (selectedCO && selectedCO.id === id) {
      setSelectedCO({ ...selectedCO, currentStatus: "Rejected" });
    }
    error(
      "Counteroffer Rejected",
      `Proposal ${id} rejected in local state. Notification flagged for procurement desk.`
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counteroffers & Negotiations"
        subtitle="Active commercial term negotiations, structured margin adjustments, and counterparty acceptance records."
        badge={
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-muted">
            PROTOTYPE WORKSPACE
          </span>
        }
      />

      {/* Prototype Banner */}
      <div className="p-3.5 bg-surface border border-border rounded-lg text-xs text-content-secondary flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          <strong>Prototype Simulation:</strong> Counteroffer actions (Approve, Reject, Propose Adjustments) modify local session state. External automated transmissions to counterparties will integrate in Module 2.
        </span>
      </div>

      {/* Counteroffers Table */}
      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-content-primary">
              Active Commercial Negotiations ({filteredCO.length})
            </h3>
            <p className="text-xs text-content-secondary mt-0.5">
              Review variances between original PO requests and proposed supplier terms
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search negotiations..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-app border border-border rounded-md px-2.5 py-1.5 text-content-secondary outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              <option value="Under review">Under review</option>
              <option value="Pending buyer acceptance">Pending buyer acceptance</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-[#FAFAF8] text-content-muted uppercase tracking-wider text-[11px] font-medium">
                <th className="py-3 px-4">Counteroffer ID</th>
                <th className="py-3 px-4">Buyer Entity</th>
                <th className="py-3 px-4">Original Requested Terms</th>
                <th className="py-3 px-4">Proposed Supplier Terms</th>
                <th className="py-3 px-4">Current Status</th>
                <th className="py-3 px-4">Last Response</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredCO.map((co) => (
                <tr
                  key={co.id}
                  onClick={() => handleOpenDetail(co)}
                  className="hover:bg-[#FAFAF8] cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary group-hover:text-primary transition-colors">
                    {co.id}
                    <span className="block text-[10px] text-content-muted font-normal">
                      {co.agreementId} • {co.poNumber}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-content-primary">
                    {co.buyer}
                  </td>
                  <td className="py-3.5 px-4 text-content-secondary max-w-xs truncate">
                    <span className="text-red-700 font-mono text-[11px]">
                      {co.originalRequestedTerms}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-content-primary max-w-xs truncate">
                    <span className="text-primary font-mono text-[11px]">
                      {co.proposedTerms}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                        co.currentStatus === "Accepted"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : co.currentStatus === "Rejected"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {co.currentStatus}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-content-muted max-w-[180px] truncate">
                    {co.lastResponse}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(co);
                      }}
                    >
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedCO ? `Negotiation Detail — ${selectedCO.id}` : "Negotiation"}
        subtitle={
          selectedCO
            ? `${selectedCO.buyer} • ${selectedCO.agreementId} (${selectedCO.poNumber})`
            : ""
        }
        width="lg"
      >
        {selectedCO && (
          <div className="space-y-6 text-xs">
            {/* Status overview */}
            <div className="p-3.5 rounded-lg bg-app border border-border flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono text-content-muted block">
                  Negotiation State
                </span>
                <span className="text-sm font-semibold text-content-primary">
                  {selectedCO.currentStatus}
                </span>
              </div>
              <span className="text-[11px] font-mono px-2 py-1 rounded bg-white border border-border text-primary font-medium">
                {selectedCO.deltaValue}
              </span>
            </div>

            {/* Terms Comparison Box */}
            <div className="space-y-3">
              <span className="font-semibold text-content-primary block uppercase tracking-wider text-[11px] font-mono">
                Comparative Terms Analysis
              </span>

              <div className="p-4 rounded-lg bg-[#FEF2F2]/60 border border-[#FECACA] space-y-1">
                <span className="text-[10px] font-mono text-red-800 uppercase font-bold tracking-wider">
                  Original Inbound PO Request
                </span>
                <p className="text-xs text-red-950 font-medium">
                  {selectedCO.originalRequestedTerms}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-[#EFF6FF]/60 border border-[#BFDBFE] space-y-1">
                <span className="text-[10px] font-mono text-blue-800 uppercase font-bold tracking-wider">
                  Supplier Proposed Counteroffer
                </span>
                <p className="text-xs text-blue-950 font-medium">
                  {selectedCO.proposedTerms}
                </p>
              </div>
            </div>

            {/* Notes / Context */}
            <div className="p-3.5 bg-surface border border-border rounded-lg space-y-1">
              <span className="text-[10px] font-mono uppercase text-content-muted">
                Audit Log & Rationale
              </span>
              <p className="text-content-secondary leading-relaxed">
                {selectedCO.notes}
              </p>
              <span className="text-[10px] text-content-muted font-mono block pt-1">
                Last update: {selectedCO.lastResponse}
              </span>
            </div>

            {/* Actions for prototype */}
            <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
              <Button
                variant="danger"
                size="sm"
                icon={<XCircle className="w-4 h-4" />}
                onClick={() => handleReject(selectedCO.id)}
                disabled={selectedCO.currentStatus === "Rejected"}
              >
                Reject Terms
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => handleApprove(selectedCO.id)}
                  disabled={selectedCO.currentStatus === "Accepted"}
                >
                  Approve Counteroffer
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
