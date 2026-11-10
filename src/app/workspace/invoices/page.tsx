"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Download,
  ShieldCheck,
  CheckCircle2,
  ArrowUpDown,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import { INVOICES } from "@/data/mockData";
import { InvoiceRecord } from "@/types";

type TabType = "all" | "draft" | "sent" | "paid" | "overdue";

export default function InvoicesPage() {
  const { success, info } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(INVOICES);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<"invoiceNumber" | "buyer" | "amount" | "dueDate">("invoiceNumber");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchTab = activeTab === "all" || inv.status === activeTab;
      const matchQuery =
        inv.invoiceNumber.toLowerCase().includes(query.toLowerCase()) ||
        inv.buyer.toLowerCase().includes(query.toLowerCase()) ||
        inv.poReference.toLowerCase().includes(query.toLowerCase()) ||
        inv.amount.toString().includes(query);
      return matchTab && matchQuery;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === "amount") {
        comparison = a.amount - b.amount;
      } else if (sortField === "buyer") {
        comparison = a.buyer.localeCompare(b.buyer);
      } else if (sortField === "dueDate") {
        comparison = a.dueDate.localeCompare(b.dueDate);
      } else {
        comparison = a.invoiceNumber.localeCompare(b.invoiceNumber);
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [invoices, activeTab, query, sortField, sortOrder]);

  const toggleSort = (field: "invoiceNumber" | "buyer" | "amount" | "dueDate") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const counts = {
    all: invoices.length,
    draft: invoices.filter((i) => i.status === "draft").length,
    sent: invoices.filter((i) => i.status === "sent").length,
    paid: invoices.filter((i) => i.status === "paid").length,
    overdue: invoices.filter((i) => i.status === "overdue").length,
  };

  const handleOpenInvoice = (inv: InvoiceRecord) => {
    setSelectedInvoice(inv);
    setDetailModalOpen(true);
  };

  const handleSimulateSend = (id: string) => {
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "sent",
              dueDate: "2026-12-10",
              paypalTrackingId: "PP-TX-SIM-9901",
            }
          : i
      )
    );
    if (selectedInvoice && selectedInvoice.id === id) {
      setSelectedInvoice({
        ...selectedInvoice,
        status: "sent",
        dueDate: "2026-12-10",
        paypalTrackingId: "PP-TX-SIM-9901",
      });
    }
    success(
      "Invoice Dispatched (Simulated)",
      "Invoice marked as sent in local prototype. PayPal live API transmission will be connected in Module 2."
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commercial Invoices"
        subtitle="Manage verified invoice issuances, PayPal gateway settlement trackers, and payment term schedules."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => info("Invoice export report compiled for accounting reconciliation.")}
          >
            Export reconciliation
          </Button>
        }
      />

      {/* Integration Notice */}
      <div className="p-3.5 bg-surface border border-border rounded-lg text-xs text-content-secondary flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span>
          <strong>Payment Gateway Notice:</strong> In this Module 1 shell, invoice records use local demonstration state. Live PayPal Invoicing API calls, webhooks, and automatic receipt processing will be integrated in Module 2.
        </span>
      </div>

      {/* Main Table Card */}
      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-border flex items-center px-4 pt-2 overflow-x-auto gap-2">
          {(
            [
              { id: "all", label: "All Invoices" },
              { id: "draft", label: "Draft" },
              { id: "sent", label: "Sent" },
              { id: "paid", label: "Paid" },
              { id: "overdue", label: "Overdue" },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-content-muted hover:text-content-primary"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isActive ? "bg-primary-subtle text-primary" : "bg-app text-content-muted"
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter input */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by invoice #, buyer, or PO..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
            />
          </div>
          <span className="text-xs text-content-muted font-mono">
            {filteredInvoices.length} invoices displayed
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-[#FAFAF8] text-content-muted uppercase tracking-wider text-[11px] font-medium">
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("invoiceNumber")}
                >
                  <div className="flex items-center gap-1">
                    <span>Invoice Number</span>
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
                <th className="py-3 px-4">PO Reference</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("amount")}
                >
                  <div className="flex items-center gap-1">
                    <span>Amount</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Payment Terms</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-content-primary transition-colors"
                  onClick={() => toggleSort("dueDate")}
                >
                  <div className="flex items-center gap-1">
                    <span>Due Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => handleOpenInvoice(inv)}
                  className="hover:bg-[#FAFAF8] cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary group-hover:text-primary transition-colors">
                    {inv.invoiceNumber}
                    {inv.paypalTrackingId && (
                      <span className="block text-[10px] text-content-muted font-normal">
                        {inv.paypalTrackingId}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-content-primary">
                    {inv.buyer}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-content-secondary">
                    {inv.poReference}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary tabular-nums">
                    {formatCurrency(inv.amount)}
                  </td>
                  <td className="py-3.5 px-4 text-content-secondary font-mono">
                    {inv.paymentTerms}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-content-muted">
                    {inv.dueDate}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenInvoice(inv);
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedInvoice ? `Commercial Invoice ${selectedInvoice.invoiceNumber}` : "Invoice"}
        description={
          selectedInvoice
            ? `Issued to ${selectedInvoice.buyer} • Referenced Agreement ${selectedInvoice.agreementId}`
            : ""
        }
        maxWidth="lg"
      >
        {selectedInvoice && (
          <div className="space-y-5 text-xs">
            <div className="p-4 bg-app rounded-lg border border-border flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono text-content-muted block">
                  Total Payable Amount
                </span>
                <span className="text-xl font-bold font-mono text-content-primary tabular-nums">
                  {formatCurrency(selectedInvoice.amount)}
                </span>
              </div>
              <StatusBadge status={selectedInvoice.status} size="md" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-border bg-surface">
                <span className="text-[10px] uppercase font-mono text-content-muted block">
                  Payment Terms
                </span>
                <span className="font-semibold text-content-primary">
                  {selectedInvoice.paymentTerms}
                </span>
              </div>
              <div className="p-3 rounded border border-border bg-surface">
                <span className="text-[10px] uppercase font-mono text-content-muted block">
                  Settlement Due Date
                </span>
                <span className="font-semibold text-content-primary font-mono">
                  {selectedInvoice.dueDate}
                </span>
              </div>
            </div>

            <div className="p-3 rounded border border-border bg-surface space-y-1">
              <span className="text-[10px] uppercase font-mono text-content-muted block">
                PayPal Settlement Channel
              </span>
              <p className="text-content-secondary">
                {selectedInvoice.paypalTrackingId
                  ? `Linked PayPal Gateway Transaction ID: ${selectedInvoice.paypalTrackingId}`
                  : "Draft invoice queued for dispatch upon final counterparty clearance."}
              </p>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between">
              <Button variant="ghost" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
              {selectedInvoice.status === "draft" && (
                <Button
                  variant="primary"
                  onClick={() => handleSimulateSend(selectedInvoice.id)}
                  icon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Mark as Sent (Simulate)
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
