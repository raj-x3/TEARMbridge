"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Copy,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import { TRANSACTIONS } from "@/data/mockData";
import { TransactionRecord } from "@/types";
import { motion } from "framer-motion";

type SortField = "agreementId" | "buyer" | "poNumber" | "value" | "stage" | "updated";

export const RecentTransactionsTable: React.FC = () => {
  const router = useRouter();
  const { success } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    return TRANSACTIONS.filter((tx) => {
      const matchesSearch =
        tx.agreementId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.buyer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.value.toString().includes(searchQuery);

      const matchesStage =
        selectedStage === "all" || tx.stage === selectedStage;

      return matchesSearch && matchesStage;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === "value") {
        comparison = a.value - b.value;
      } else if (sortField === "agreementId") {
        comparison = a.agreementId.localeCompare(b.agreementId);
      } else if (sortField === "buyer") {
        comparison = a.buyer.localeCompare(b.buyer);
      } else if (sortField === "poNumber") {
        comparison = a.poNumber.localeCompare(b.poNumber);
      } else if (sortField === "stage") {
        comparison = a.stage.localeCompare(b.stage);
      } else {
        comparison = a.date.localeCompare(b.date);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [searchQuery, selectedStage, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleRowClick = (tx: TransactionRecord) => {
    router.push(`/workspace/agreements/${tx.agreementId}`);
  };

  const toggleExpandRow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(id);
    success("Copied to Clipboard", `Agreement reference ${id} copied.`);
  };

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-subtle">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">
            Recent Commercial Transactions
          </h3>
          <p className="text-xs text-content-secondary mt-0.5">
            Click any row to open the full agreement workbench, or expand for details
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Stage filter dropdown */}
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="text-xs bg-app border border-border rounded-md px-2.5 py-1.5 text-content-secondary outline-none focus:border-primary transition-colors"
          >
            <option value="all">All stages</option>
            <option value="needs_review">Needs review</option>
            <option value="counteroffer_sent">Counteroffer sent</option>
            <option value="ready_to_invoice">Ready to invoice</option>
            <option value="completed">Completed</option>
            <option value="awaiting_counterparty">Awaiting counterparty</option>
          </select>
        </div>
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-[#FAFAF8] text-content-muted font-medium uppercase tracking-wider text-[11px]">
              <th className="py-3 px-3 w-8"></th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("agreementId")}
              >
                <div className="flex items-center gap-1">
                  <span>Agreement</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("buyer")}
              >
                <div className="flex items-center gap-1">
                  <span>Buyer</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("poNumber")}
              >
                <div className="flex items-center gap-1">
                  <span>Purchase Order</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("value")}
              >
                <div className="flex items-center gap-1">
                  <span>Value</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("stage")}
              >
                <div className="flex items-center gap-1">
                  <span>Current Stage</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                className="py-3 px-3 cursor-pointer hover:text-content-primary transition-colors"
                onClick={() => toggleSort("updated")}
              >
                <div className="flex items-center gap-1">
                  <span>Updated</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="py-3 px-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-content-muted">
                  No commercial transactions match your query.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => {
                const isExpanded = expandedRowId === tx.id;
                return (
                  <React.Fragment key={tx.id}>
                    <tr
                      onClick={() => handleRowClick(tx)}
                      className={`hover:bg-[#F9F9F7] cursor-pointer transition-colors group ${
                        isExpanded ? "bg-[#F9F9F7]" : ""
                      }`}
                    >
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={(e) => toggleExpandRow(e, tx.id)}
                          className="p-1 rounded hover:bg-app text-content-muted hover:text-content-primary transition-colors"
                          aria-label="Expand row details"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 px-3 font-mono font-medium text-content-primary">
                        <span className="group-hover:text-primary transition-colors">
                          {tx.agreementId}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-medium text-content-primary">
                        {tx.buyer}
                      </td>
                      <td className="py-3.5 px-3 font-mono text-content-secondary">
                        {tx.poNumber}
                      </td>
                      <td className="py-3.5 px-3 font-mono font-semibold text-content-primary tabular-nums">
                        {formatCurrency(tx.value)}
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusBadge status={tx.stage} label={tx.stageLabel} />
                      </td>
                      <td className="py-3.5 px-3 text-content-muted text-[11px] font-mono">
                        {tx.updated}
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <ChevronRight className="w-4 h-4 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all inline-block" />
                      </td>
                    </tr>

                    {/* Expandable Transaction Details Drawer */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0 bg-[#F4F4F1]/60 border-b border-border">
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="p-4 pl-12 space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-content-primary text-xs">
                                    {tx.agreementId} Overview
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-content-secondary">
                                    Supplier: {tx.supplier}
                                  </span>
                                </div>
                                <p className="text-[11px] text-content-secondary">
                                  Commercial purchasing flow between {tx.buyer} and {tx.supplier}. Order reference {tx.poNumber}.
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  icon={<Copy className="w-3 h-3" />}
                                  onClick={(e) => handleCopyId(e, tx.agreementId)}
                                >
                                  Copy ID
                                </Button>
                                <Button
                                  variant="primary"
                                  size="xs"
                                  icon={<ExternalLink className="w-3 h-3" />}
                                  onClick={() => handleRowClick(tx)}
                                >
                                  Open Workbench
                                </Button>
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-border-subtle bg-app flex items-center justify-between text-[11px] text-content-muted">
        <span>Showing {filteredTransactions.length} of {TRANSACTIONS.length} transaction records</span>
        <span className="font-mono">Fictional demonstration data</span>
      </div>
    </div>
  );
};
