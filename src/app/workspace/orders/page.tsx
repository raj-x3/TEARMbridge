"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  ArrowUpDown,
  FileText,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImportPOModal } from "@/components/modals/ImportPOModal";
import { formatCurrency } from "@/lib/utils";
import { PURCHASE_ORDERS } from "@/data/mockData";
import { PurchaseOrderRecord } from "@/types";

type POSortField =
  | "poNumber"
  | "buyer"
  | "supplier"
  | "amount"
  | "receivedDate"
  | "processingState";

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [sortField, setSortField] = useState<POSortField>("poNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [importModalOpen, setImportModalOpen] = useState(false);

  const filteredOrders = useMemo(() => {
    return PURCHASE_ORDERS.filter((order) => {
      const matchQuery =
        order.poNumber.toLowerCase().includes(query.toLowerCase()) ||
        order.buyer.toLowerCase().includes(query.toLowerCase()) ||
        order.linkedAgreement.toLowerCase().includes(query.toLowerCase()) ||
        order.amount.toString().includes(query);

      const matchState =
        selectedState === "all" || order.processingState === selectedState;

      return matchQuery && matchState;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === "amount") {
        comparison = a.amount - b.amount;
      } else if (sortField === "poNumber") {
        comparison = a.poNumber.localeCompare(b.poNumber);
      } else if (sortField === "buyer") {
        comparison = a.buyer.localeCompare(b.buyer);
      } else if (sortField === "supplier") {
        comparison = a.supplier.localeCompare(b.supplier);
      } else if (sortField === "processingState") {
        comparison = a.processingState.localeCompare(b.processingState);
      } else {
        comparison = a.receivedDate.localeCompare(b.receivedDate);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [query, selectedState, sortField, sortOrder]);

  const toggleSort = (field: POSortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleRowClick = (po: PurchaseOrderRecord) => {
    router.push(`/workspace/agreements/${po.linkedAgreement}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="Inbound commercial purchase orders pending contract validation, term reconciliation, and invoicing execution."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setImportModalOpen(true)}
          >
            Import purchase order
          </Button>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search PO, buyer, or agreement..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="text-xs bg-app border border-border rounded-md px-2.5 py-1.5 text-content-secondary outline-none focus:border-primary"
            >
              <option value="all">All processing states</option>
              <option value="needs_review">Needs review</option>
              <option value="counteroffer_sent">Counteroffer sent</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="completed">Completed</option>
              <option value="awaiting_counterparty">Awaiting counterparty</option>
            </select>
          </div>
        </div>

        {/* Table / Empty State */}
        {filteredOrders.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={FileText}
              title="No purchase orders match your filters"
              description="Try adjusting your search criteria or clear the filters to view inbound records."
              actionLabel="Clear all filters"
              onAction={() => {
                setQuery("");
                setSelectedState("all");
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-[#FAFAF8] text-content-muted uppercase tracking-wider text-[11px] font-medium">
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("poNumber")}
                  >
                    <div className="flex items-center gap-1">
                      <span>PO Number</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("buyer")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Buyer</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("supplier")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Supplier</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("amount")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Amount</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("receivedDate")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Received Date</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                    onClick={() => toggleSort("processingState")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Processing State</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Linked Agreement</th>
                  <th className="py-3 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredOrders.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => handleRowClick(po)}
                    className="hover:bg-[#FAFAF8] cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-content-primary group-hover:text-primary transition-colors">
                      {po.poNumber}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-content-primary">
                      {po.buyer}
                    </td>
                    <td className="py-3.5 px-4 text-content-secondary">
                      {po.supplier}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-content-primary tabular-nums">
                      {formatCurrency(po.amount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-content-muted">
                      {po.receivedDate}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge
                        status={po.processingState}
                        label={po.processingStateLabel}
                      />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-primary font-medium">
                      {po.linkedAgreement}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <ChevronRight className="w-4 h-4 text-content-muted group-hover:text-primary inline-block transition-transform group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-3 border-t border-border-subtle bg-app flex items-center justify-between text-[11px] text-content-muted">
          <span>Showing {filteredOrders.length} purchase order records</span>
          <span className="font-mono">Demo Workspace Inbound Feed</span>
        </div>
      </div>

      <ImportPOModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
      />
    </div>
  );
}
