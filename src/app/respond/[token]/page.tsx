"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  Building2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ProposalData {
  token_id: string;
  counteroffer_id: string;
  version_id: string;
  version_number: number;
  agreement_reference: string;
  agreement_title?: string;
  po_number: string;
  buyer_name: string;
  supplier_name: string;
  recipient_email: string;
  status: string;
  expires_at: string;
  proposed_terms: {
    quantity: number;
    unit_price_cents: number;
    discount_percent: number;
    discount_amount_cents: number;
    payment_term_days: number;
    payment_term_label: string;
    delivery_days: number;
    currency: string;
    line_items: Array<{
      product_name: string;
      quantity: number;
      unit_price_cents: number;
      gross_amount_cents: number;
      discount_amount_cents: number;
      net_amount_cents: number;
    }>;
  };
  original_terms: {
    quantity: number;
    unit_price: string;
    discount_percent: number;
    payment_terms: string;
    delivery_days: number;
    currency: string;
    product_name?: string;
  };
  financial_summary: {
    gross_amount: string;
    discount_amount: string;
    subtotal: string;
    tax_amount: string;
    shipping_amount: string;
    grand_total: string;
    currency: string;
  };
  explanation: string;
  terms_hash: string;
  disclosure: string;
}

export default function BuyerProposalResponsePage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [responseResult, setResponseResult] = useState<{
    action: string;
    message: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [showNotesModal, setShowNotesModal] = useState<"reject" | "request_changes" | null>(null);

  useEffect(() => {
    async function loadProposal() {
      try {
        setLoading(true);
        const res = await fetch(`/api/public/counteroffers/${token}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setErrorMsg(json.error || "Failed to load commercial proposal.");
        } else {
          setProposal(json.data);
        }
      } catch {
        setErrorMsg("Network error connecting to supplier proposal service.");
      } finally {
        setLoading(false);
      }
    }
    loadProposal();
  }, [token]);

  const handleAction = async (action: "accept" | "reject" | "request_changes", customNotes = "") => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/public/counteroffers/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: customNotes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "Failed to submit response.");
      } else {
        setResponseResult({
          action,
          message: json.data?.message || "Response recorded successfully.",
        });
        setShowNotesModal(null);
      }
    } catch {
      alert("Error submitting response.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-subtle text-center space-y-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-base font-semibold text-content-primary">
            Retrieving Commercial Proposal...
          </h2>
          <p className="text-xs text-content-secondary">
            Verifying cryptographic bearer token and loading proposal terms.
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg || !proposal) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl p-8 max-w-lg w-full shadow-subtle space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <div className="text-center space-y-1.5">
            <h2 className="text-lg font-bold text-content-primary">
              Proposal Access Notice
            </h2>
            <p className="text-xs text-content-secondary leading-relaxed">
              {errorMsg}
            </p>
          </div>
          <div className="p-3.5 bg-app border border-border rounded-lg text-[11px] text-content-muted leading-relaxed">
            Proposal links are single-use and bound to exact commercial counteroffer versions. If this link was already used or expired, please contact the supplier procurement desk to request a renewed proposal.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Brand / Header */}
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm tracking-wider">
              TB
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-content-muted block">
                TERMBridge Commercial Proposal Portal
              </span>
              <h1 className="text-base font-bold text-content-primary">
                Counteroffer Review — {proposal.po_number}
              </h1>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-content-secondary">
              Ref: {proposal.agreement_reference}
            </span>
          </div>
        </div>

        {/* Success Banner if responded */}
        {responseResult && (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-bold">
                Commercial Decision Confirmed ({responseResult.action.toUpperCase()})
              </span>
            </div>
            <p className="text-xs text-emerald-800 leading-relaxed">
              {responseResult.message}
            </p>
            <div className="text-[11px] font-mono text-emerald-700 pt-2 border-t border-emerald-200/60">
              Recorded via single-use bearer token. Mutual commercial record updated.
            </div>
          </div>
        )}

        {/* Counterparty Context Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-surface border border-border rounded-xl space-y-1">
            <span className="text-[10px] font-mono uppercase text-content-muted flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Supplier (Seller)
            </span>
            <div className="text-sm font-bold text-content-primary">
              {proposal.supplier_name}
            </div>
            <div className="text-xs text-content-secondary">
              Commercial Supplier Organization
            </div>
          </div>

          <div className="p-4 bg-surface border border-border rounded-xl space-y-1">
            <span className="text-[10px] font-mono uppercase text-content-muted flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Counterparty (Buyer)
            </span>
            <div className="text-sm font-bold text-content-primary">
              {proposal.buyer_name}
            </div>
            <div className="text-xs text-content-secondary">
              Recipient: {proposal.recipient_email}
            </div>
          </div>
        </div>

        {/* Supplier Explanation */}
        <div className="p-4 bg-surface border border-border rounded-xl space-y-2">
          <span className="text-[10px] font-mono uppercase text-content-muted block">
            Supplier Commercial Explanation
          </span>
          <p className="text-xs text-content-primary leading-relaxed font-medium">
            {proposal.explanation}
          </p>
          <div className="flex items-center gap-4 text-[11px] font-mono text-content-muted pt-2 border-t border-border">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Expires: {new Date(proposal.expires_at).toLocaleDateString()}
            </span>
            <span>Version: v{proposal.version_number}</span>
            <span className="truncate max-w-[200px]" title={proposal.terms_hash}>
              Hash: {proposal.terms_hash.slice(0, 12)}...
            </span>
          </div>
        </div>

        {/* Terms Comparison Table */}
        <div className="bg-surface border border-border rounded-xl shadow-subtle overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-content-primary">
              Proposed Commercial Terms vs Original Inbound PO
            </h3>
            <p className="text-xs text-content-secondary mt-0.5">
              Review variances between your original purchase order request and the supplier&apos;s rule-validated counteroffer.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-app border-b border-border text-[11px] font-mono uppercase text-content-muted">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Commercial Term</th>
                  <th className="py-2.5 px-4 font-semibold text-red-700">Original Request (PO)</th>
                  <th className="py-2.5 px-4 font-semibold text-emerald-700">Proposed Counteroffer</th>
                  <th className="py-2.5 px-4 font-semibold">Variance Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-3 px-4 font-medium text-content-primary">Order Quantity</td>
                  <td className="py-3 px-4 font-mono text-content-secondary line-through">
                    {proposal.original_terms.quantity} units
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                    {proposal.proposed_terms.quantity} units
                  </td>
                  <td className="py-3 px-4 text-content-secondary">
                    Adjusted to satisfy contractual Minimum Order Quantity (MOQ 50).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-content-primary">Unit Price</td>
                  <td className="py-3 px-4 font-mono text-content-secondary">
                    ${proposal.original_terms.unit_price} USD
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                    ${(proposal.proposed_terms.unit_price_cents / 100).toFixed(2)} USD
                  </td>
                  <td className="py-3 px-4 text-content-secondary">
                    Matches Master Agreement unit price ($100.00).
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-content-primary">Volume Discount</td>
                  <td className="py-3 px-4 font-mono text-content-secondary line-through">
                    {proposal.original_terms.discount_percent}% (Promotional)
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                    {proposal.proposed_terms.discount_percent}% (Tier-1 Volume)
                  </td>
                  <td className="py-3 px-4 text-content-secondary">
                    Contractual 10% volume discount applied upon meeting 50-unit threshold.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-content-primary">Payment Terms</td>
                  <td className="py-3 px-4 font-mono text-content-secondary line-through">
                    {proposal.original_terms.payment_terms || "Net 60"}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                    {proposal.proposed_terms.payment_term_label || "Net 45"}
                  </td>
                  <td className="py-3 px-4 text-content-secondary">
                    Reconciled to operative Net 45 terms under Amendment No. 1.
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-content-primary">Fulfillment Window</td>
                  <td className="py-3 px-4 font-mono text-content-secondary line-through">
                    {proposal.original_terms.delivery_days} business days
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                    {proposal.proposed_terms.delivery_days} business days
                  </td>
                  <td className="py-3 px-4 text-content-secondary">
                    Standard contractual 7-business-day fulfillment lead time.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Summary Box */}
        <div className="p-5 bg-surface border border-border rounded-xl space-y-3">
          <h4 className="text-xs font-mono uppercase text-content-muted tracking-wider">
            Financial Calculation Breakdown (Exact Decimal Arithmetic)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div className="space-y-0.5">
              <span className="text-[11px] text-content-secondary">Gross Amount</span>
              <div className="text-base font-mono font-bold text-content-primary">
                ${proposal.financial_summary.gross_amount}
              </div>
              <span className="text-[10px] text-content-muted">50 units @ $100.00</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] text-content-secondary">Volume Discount</span>
              <div className="text-base font-mono font-bold text-emerald-700">
                -${proposal.financial_summary.discount_amount}
              </div>
              <span className="text-[10px] text-content-muted">10% Tier-1 Discount</span>
            </div>

            <div className="space-y-0.5">
              <span className="text-[11px] text-content-secondary">Taxes & Shipping</span>
              <div className="text-base font-mono font-bold text-content-primary">
                ${proposal.financial_summary.tax_amount}
              </div>
              <span className="text-[10px] text-content-muted">Preserved standard</span>
            </div>

            <div className="space-y-0.5 p-2 rounded-lg bg-app border border-border">
              <span className="text-[11px] font-bold text-content-primary">Payable Subtotal</span>
              <div className="text-base font-mono font-extrabold text-primary">
                ${proposal.financial_summary.grand_total} {proposal.financial_summary.currency}
              </div>
              <span className="text-[10px] text-content-muted">Invoice Ready Amount</span>
            </div>
          </div>
        </div>

        {/* Legal & Identity Disclosure */}
        <div className="p-3.5 bg-surface border border-border rounded-lg text-xs text-content-secondary flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-content-muted shrink-0 mt-0.5" />
          <span className="text-[11px] leading-relaxed">
            <strong>Security & Legal Notice:</strong> {proposal.disclosure}
          </span>
        </div>

        {/* Action Buttons (Disabled if already responded) */}
        {!responseResult && (
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button
              variant="danger"
              size="md"
              icon={<XCircle className="w-4 h-4" />}
              disabled={submitting}
              onClick={() => setShowNotesModal("reject")}
            >
              Reject Proposal
            </Button>

            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                size="md"
                disabled={submitting}
                onClick={() => setShowNotesModal("request_changes")}
              >
                Request Term Changes
              </Button>

              <Button
                variant="primary"
                size="md"
                icon={<Check className="w-4 h-4" />}
                disabled={submitting}
                onClick={() => handleAction("accept")}
              >
                Accept Proposal Terms
              </Button>
            </div>
          </div>
        )}

        {/* Modal for Reject / Request Changes */}
        {showNotesModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-content-primary">
                {showNotesModal === "reject"
                  ? "Confirm Counteroffer Rejection"
                  : "Request Proposal Adjustments"}
              </h3>
              <p className="text-xs text-content-secondary leading-relaxed">
                {showNotesModal === "reject"
                  ? "Please provide an optional reason for rejecting the supplier's commercial proposal."
                  : "Specify the adjustments or commercial concessions requested from the supplier."}
              </p>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter notes for the procurement desk..."
                rows={3}
                className="w-full p-2.5 text-xs bg-app border border-border rounded-md text-content-primary outline-none focus:border-primary resize-none"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotesModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant={showNotesModal === "reject" ? "danger" : "primary"}
                  size="sm"
                  disabled={submitting}
                  onClick={() => handleAction(showNotesModal, notes)}
                >
                  Confirm {showNotesModal === "reject" ? "Rejection" : "Change Request"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
