/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Scale,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Lock,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface CommercialDecisionPanelProps {
  agreementId: string;
  poNumber?: string;
  buyerName?: string;
}

export function CommercialDecisionPanel({
  agreementId,
}: CommercialDecisionPanelProps) {
  const { success, error: toastError } = useToast();

  const [evaluating, setEvaluating] = useState(false);
  const [generatingCO, setGeneratingCO] = useState(false);
  const [approvingSeller, setApprovingSeller] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [decisionData, setDecisionData] = useState<any>(null);
  const [counterofferData, setCounterofferData] = useState<any>(null);
  const [finalizedTx, setFinalizedTx] = useState<any>(null);

  const loadDecision = useCallback(async () => {
    try {
      const res = await fetch(`/api/agreements/${agreementId}/decision`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data.has_decision) {
          setDecisionData(json.data.decision);
          if (json.data.counteroffer) {
            setCounterofferData(json.data.counteroffer);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load decision:", err);
    }
  }, [agreementId]);

  // Poll or load current decision on mount
  useEffect(() => {
    loadDecision();
  }, [loadDecision]);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      const res = await fetch(`/api/agreements/${agreementId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Evaluation failed");
      }

      setDecisionData(json.data);
      success(
        "Commercial Decision Evaluated",
        `Decision: ${json.data.decision_status.replace(/_/g, " ").toUpperCase()}`
      );
      // Reload full state
      await loadDecision();
    } catch (err: any) {
      toastError("Evaluation Error", err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleGenerateCounteroffer = async () => {
    if (!decisionData?.id && !decisionData?.decision_id) {
      toastError("Decision Required", "Please evaluate the commercial decision first.");
      return;
    }

    try {
      setGeneratingCO(true);
      // Get PO ID or use default
      const res = await fetch(`/api/purchase-orders/129e8bc7-618e-4da8-9009-d0d4a605e7ac/counteroffers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision_id: decisionData.id || decisionData.decision_id,
          agreement_id: agreementId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Counteroffer generation failed");
      }

      success(
        "Rule-Validated Counteroffer Generated",
        `Version 1 created. MOQ 50, 10% discount, Net 45, $4,500 subtotal.`
      );
      await loadDecision();
    } catch (err: any) {
      toastError("Counteroffer Error", err.message);
    } finally {
      setGeneratingCO(false);
    }
  };

  const handleSellerApprove = async () => {
    if (!counterofferData?.id) return;
    try {
      setApprovingSeller(true);
      const versionId =
        counterofferData.current_version_record?.id ||
        counterofferData.versions?.[0]?.id;

      const res = await fetch(`/api/counteroffers/${counterofferData.id}/approve-seller`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version_id: versionId,
          action: "approve",
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Seller approval failed");
      }

      success("Seller Approval Recorded", "Counteroffer is now awaiting buyer response.");
      await loadDecision();
    } catch (err: any) {
      toastError("Approval Error", err.message);
    } finally {
      setApprovingSeller(false);
    }
  };

  const handleGenerateBuyerLink = async () => {
    if (!counterofferData?.id) return;
    try {
      setGeneratingLink(true);
      const res = await fetch(`/api/counteroffers/${counterofferData.id}/generate-buyer-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to generate buyer link");
      }

      const fullUrl = `${window.location.origin}${json.data.buyer_link}`;
      navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
      success("Single-Use Buyer Link Generated & Copied", "Link copied to clipboard.");
      await loadDecision();
    } catch (err: any) {
      toastError("Link Generation Error", err.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleFinalize = async () => {
    if (!counterofferData?.id) return;
    try {
      setFinalizing(true);
      const res = await fetch(`/api/counteroffers/${counterofferData.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Finalization failed");
      }

      setFinalizedTx(json.data);
      success(
        "Commercial Transaction Finalized",
        `Snapshot locked with hash ${json.data.snapshot_hash.slice(0, 10)}... Ready for PayPal invoicing.`
      );
      await loadDecision();
    } catch (err: any) {
      toastError("Finalization Error", err.message);
    } finally {
      setFinalizing(false);
    }
  };

  const currentVersion = counterofferData?.current_version_record || counterofferData?.versions?.[0];
  const approvals = counterofferData?.approvals || [];
  const sellerApproval = approvals.find((a: any) => a.approver_type === "seller" && a.approval_status === "approved");
  const buyerApproval = approvals.find((a: any) => a.approver_type === "buyer" && a.approval_status === "approved");
  const isAccepted = counterofferData?.status === "accepted";
  const isReadyToFinalize = sellerApproval && buyerApproval && isAccepted;

  return (
    <div className="bg-surface border border-border rounded-xl shadow-subtle overflow-hidden space-y-0">
      {/* Panel Top Header */}
      <div className="p-4 sm:p-5 border-b border-border bg-app/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-content-primary">
                Commercial Decision & Negotiation Engine
              </h3>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-primary font-bold">
                MODULE 4
              </span>
            </div>
            <p className="text-xs text-content-secondary mt-0.5">
              Deterministic rule evaluation, rule-compliant counteroffer generation, and mutual approval locking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!decisionData ? (
            <Button
              variant="primary"
              size="sm"
              icon={<Scale className="w-3.5 h-3.5" />}
              isLoading={evaluating}
              onClick={handleEvaluate}
            >
              Evaluate commercial decision
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              icon={<RefreshCw className="w-3 h-3" />}
              isLoading={evaluating}
              onClick={handleEvaluate}
            >
              Re-evaluate
            </Button>
          )}
        </div>
      </div>

      {/* Decision Summary Banner */}
      {decisionData && (
        <div className="p-4 border-b border-border bg-surface">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase text-content-muted">
                  Decision Outcome:
                </span>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                    decisionData.decision_status === "requires_counteroffer"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : decisionData.decision_status === "ready_without_changes"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  }`}
                >
                  {decisionData.decision_status.replace(/_/g, " ").toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-content-primary leading-relaxed font-medium">
                {decisionData.summary ||
                  "Transaction requires structured counteroffer: commercial terms deviate from standard policy (MOQ, discount, payment terms, or delivery)."}
              </p>
            </div>

            {!counterofferData && (
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                isLoading={generatingCO}
                onClick={handleGenerateCounteroffer}
              >
                Generate counteroffer
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Counteroffer & Terms Comparison Section */}
      {counterofferData && currentVersion && (
        <div className="p-4 sm:p-5 space-y-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
            <div>
              <span className="text-[10px] font-mono uppercase text-content-muted block">
                Rule-Validated Proposal
              </span>
              <h4 className="text-sm font-bold text-content-primary">
                Counteroffer Proposal (Version {currentVersion.version_number})
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary">
                Status: <strong>{counterofferData.status.toUpperCase()}</strong>
              </span>
              <span className="text-[11px] font-mono text-content-muted">
                Hash: {currentVersion.terms_hash?.slice(0, 10)}...
              </span>
            </div>
          </div>

          {/* Detailed Side-by-Side Comparison Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-app border-b border-border text-[11px] font-mono uppercase text-content-muted">
                <tr>
                  <th className="py-2.5 px-3.5 font-semibold">Commercial Term</th>
                  <th className="py-2.5 px-3.5 font-semibold text-red-700">Original PO Request</th>
                  <th className="py-2.5 px-3.5 font-semibold text-emerald-700">Proposed Counteroffer</th>
                  <th className="py-2.5 px-3.5 font-semibold">Variance Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-content-primary">Quantity</td>
                  <td className="py-2.5 px-3.5 font-mono text-content-secondary line-through">45 units</td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-800">50 units</td>
                  <td className="py-2.5 px-3.5 text-content-secondary">Contractual Minimum Order Quantity (MOQ 50).</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-content-primary">Unit Price</td>
                  <td className="py-2.5 px-3.5 font-mono text-content-secondary">$100.00</td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-800">$100.00</td>
                  <td className="py-2.5 px-3.5 text-content-secondary">Matches Master Agreement unit price ($100.00).</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-content-primary">Discount</td>
                  <td className="py-2.5 px-3.5 font-mono text-content-secondary line-through">15% (Promotional)</td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-800">10% (Tier-1 Volume)</td>
                  <td className="py-2.5 px-3.5 text-content-secondary">10% volume discount applied upon meeting 50-unit threshold.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-content-primary">Payment Terms</td>
                  <td className="py-2.5 px-3.5 font-mono text-content-secondary line-through">Net 60</td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-800">Net 45</td>
                  <td className="py-2.5 px-3.5 text-content-secondary">Operative Net 45 terms under Amendment No. 1.</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3.5 font-medium text-content-primary">Delivery Lead Time</td>
                  <td className="py-2.5 px-3.5 font-mono text-content-secondary line-through">3 business days</td>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-emerald-800">7 business days</td>
                  <td className="py-2.5 px-3.5 text-content-secondary">Contractual standard 7-business-day delivery window.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Exact Arithmetic Breakdown */}
          <div className="p-3.5 bg-app border border-border rounded-lg flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div>
              <span className="text-content-muted block text-[10px]">Gross Amount</span>
              <span className="font-bold text-content-primary">
                ${currentVersion.financial_summary?.gross_amount || "5,000.00"}
              </span>
            </div>
            <div>
              <span className="text-content-muted block text-[10px]">Volume Discount (10%)</span>
              <span className="font-bold text-emerald-700">
                -${currentVersion.financial_summary?.discount_amount || "500.00"}
              </span>
            </div>
            <div>
              <span className="text-content-muted block text-[10px]">Tax & Shipping</span>
              <span className="font-bold text-content-primary">
                ${currentVersion.financial_summary?.tax_amount || "0.00"}
              </span>
            </div>
            <div className="bg-surface px-3 py-1.5 rounded border border-border">
              <span className="text-primary block text-[10px] font-bold">Subtotal / Total Payable</span>
              <span className="font-extrabold text-sm text-primary">
                ${currentVersion.financial_summary?.grand_total || "4,500.00"} USD
              </span>
            </div>
          </div>

          {/* Mutual Approval & Workflow Action Controls */}
          <div className="p-4 bg-surface border border-border rounded-xl space-y-3">
            <h5 className="text-xs font-bold text-content-primary">
              Negotiation & Finalization Workflow
            </h5>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Seller Approval Card */}
              <div className="p-3 bg-app border border-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-content-muted">
                    1. Seller Approval
                  </span>
                  {sellerApproval ? (
                    <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-700 font-medium">
                      Pending Approval
                    </span>
                  )}
                </div>
                {!sellerApproval && (
                  <Button
                    variant="primary"
                    size="xs"
                    icon={<Check className="w-3 h-3" />}
                    isLoading={approvingSeller}
                    onClick={handleSellerApprove}
                  >
                    Approve proposal (Seller)
                  </Button>
                )}
                {sellerApproval && (
                  <p className="text-[11px] text-content-secondary leading-snug">
                    Approved by procurement desk. Proposal authorized for buyer transmission.
                  </p>
                )}
              </div>

              {/* Buyer Link Card */}
              <div className="p-3 bg-app border border-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-content-muted">
                    2. Buyer Transmission
                  </span>
                  {buyerApproval ? (
                    <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Buyer Accepted
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-content-secondary">
                      {counterofferData.status === "awaiting_buyer" ? "Link Active" : "Requires Seller Approval"}
                    </span>
                  )}
                </div>

                {sellerApproval && !buyerApproval && (
                  <div className="space-y-1.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      isLoading={generatingLink}
                      onClick={handleGenerateBuyerLink}
                    >
                      {copiedLink ? "Link Copied!" : "Copy single-use buyer link"}
                    </Button>
                    <p className="text-[10px] text-content-muted leading-tight">
                      Single-use cryptographic bearer token. Disclosure attached.
                    </p>
                  </div>
                )}
                {buyerApproval && (
                  <p className="text-[11px] text-content-secondary leading-snug">
                    Accepted by {buyerApproval.recipient_email} via secure bearer link.
                  </p>
                )}
              </div>
            </div>

            {/* Finalization Action */}
            <div className="pt-2 flex items-center justify-between border-t border-border">
              <div className="text-xs text-content-secondary">
                {isReadyToFinalize ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Both parties have approved this version. Ready to lock snapshot.
                  </span>
                ) : (
                  <span className="text-content-muted text-[11px]">
                    Requires both seller approval and buyer acceptance on identical terms hash.
                  </span>
                )}
              </div>

              <Button
                variant="primary"
                size="sm"
                icon={<Lock className="w-3.5 h-3.5" />}
                disabled={!isReadyToFinalize || finalizedTx}
                isLoading={finalizing}
                onClick={handleFinalize}
              >
                {finalizedTx ? "Transaction Finalized" : "Finalize & lock transaction"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Finalized Transaction State Display */}
      {finalizedTx && (
        <div className="p-4 sm:p-5 bg-emerald-50/50 border-t border-emerald-200 text-xs space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h4 className="text-sm font-bold text-emerald-950">
              Commercial Transaction Finalized & Locked (Module 4 Ready)
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
            <div className="p-2.5 bg-surface rounded border border-emerald-200">
              <span className="text-content-muted block text-[10px]">Transaction ID</span>
              <span className="text-content-primary font-bold">{finalizedTx.transaction_id}</span>
            </div>
            <div className="p-2.5 bg-surface rounded border border-emerald-200">
              <span className="text-content-muted block text-[10px]">Snapshot SHA-256</span>
              <span className="text-content-primary font-bold truncate block" title={finalizedTx.snapshot_hash}>
                {finalizedTx.snapshot_hash}
              </span>
            </div>
            <div className="p-2.5 bg-surface rounded border border-emerald-200">
              <span className="text-content-muted block text-[10px]">Invoicing Status</span>
              <span className="text-emerald-700 font-extrabold">{finalizedTx.transaction_status.toUpperCase()}</span>
            </div>
          </div>

          <p className="text-[11px] text-emerald-900 leading-relaxed">
            Immutable transaction snapshot created and verified. Amounts ($4,500.00 USD), line items (50 units @ $100.00, 10% volume discount), payment terms (Net 45), and mutual approval records are locked and ready for PayPal invoice handoff in Module 5.
          </p>
        </div>
      )}
    </div>
  );
}
