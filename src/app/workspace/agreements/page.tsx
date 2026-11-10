"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, ArrowUpDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/utils";
import { TRANSACTIONS } from "@/data/mockData";

export default function AgreementsIndexPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [sortField, setSortField] = useState<"agreementId" | "buyer" | "value" | "stage">("agreementId");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = TRANSACTIONS.filter((t) => {
    const matchQ =
      t.agreementId.toLowerCase().includes(query.toLowerCase()) ||
      t.buyer.toLowerCase().includes(query.toLowerCase()) ||
      t.poNumber.toLowerCase().includes(query.toLowerCase()) ||
      t.value.toString().includes(query);
    const matchS = filterStage === "all" || t.stage === filterStage;
    return matchQ && matchS;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortField === "value") {
      comparison = a.value - b.value;
    } else if (sortField === "buyer") {
      comparison = a.buyer.localeCompare(b.buyer);
    } else if (sortField === "stage") {
      comparison = a.stage.localeCompare(b.stage);
    } else {
      comparison = a.agreementId.localeCompare(b.agreementId);
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  const toggleSort = (field: "agreementId" | "buyer" | "value" | "stage") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commercial Agreements"
        subtitle="Manage active purchasing agreements, term reconciliation tables, and legal validation records."
        actions={
          <Link href="/workspace/agreements/AGR-1042">
            <Button variant="primary" size="sm">
              Open Flagship (AGR-1042)
            </Button>
          </Link>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by ID, buyer or PO..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="text-xs bg-app border border-border rounded-md px-2.5 py-1.5 text-content-secondary outline-none focus:border-primary"
            >
              <option value="all">All stages</option>
              <option value="needs_review">Needs review</option>
              <option value="counteroffer_sent">Counteroffer sent</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead>
              <tr className="border-b border-border bg-[#FAFAF8] text-content-muted uppercase tracking-wider text-[11px] font-medium">
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("agreementId")}
                >
                  <div className="flex items-center gap-1">
                    <span>Agreement ID</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("buyer")}
                >
                  <div className="flex items-center gap-1">
                    <span>Buyer Entity</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Referenced PO</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("value")}
                >
                  <div className="flex items-center gap-1">
                    <span>Transaction Value</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("stage")}
                >
                  <div className="flex items-center gap-1">
                    <span>Current Stage</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => router.push(`/workspace/agreements/${item.agreementId}`)}
                  className="hover:bg-[#FAFAF8] cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary group-hover:text-primary transition-colors">
                    {item.agreementId}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-content-primary">
                    {item.buyer}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-content-secondary">
                    {item.poNumber}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary tabular-nums">
                    {formatCurrency(item.value)}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={item.stage} label={item.stageLabel} />
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-content-muted">
                    {item.updated}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <ChevronRight className="w-4 h-4 text-content-muted group-hover:text-primary inline-block transition-transform group-hover:translate-x-0.5" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
