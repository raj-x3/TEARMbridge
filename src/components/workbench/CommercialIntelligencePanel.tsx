"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  X,
  FileCheck,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export interface FindingEvidence {
  id: string;
  source_ref: string;
  location_type: string;
  location: Record<string, unknown>;
  quote: string;
  verification_status:
    | "verified_exact"
    | "verified_normalized"
    | "visually_located_unverified"
    | "not_found"
    | "invalid_source";
  verification_method: string;
}

export interface IntelligenceFinding {
  id: string;
  term_key: string;
  term_label: string;
  finding_type:
    | "matched"
    | "conflict"
    | "missing_in_purchase_order"
    | "missing_in_agreement"
    | "ambiguous"
    | "unsupported"
    | "unverifiable";
  severity: "critical" | "high" | "medium" | "low" | "informational";
  agreement_value?: { value: string; clause?: string; quote?: string; source_ref?: string } | null;
  amendment_value?: { value: string; amendment_id?: string; effective_date?: string; quote?: string; source_ref?: string } | null;
  purchase_order_value?: { value: string; quote?: string; source_ref?: string } | null;
  explanation: string;
  difference_summary?: string | null;
  confidence: number;
  review_status?: "unreviewed" | "confirmed" | "dismissed" | "needs_more_information";
  review_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  evidence?: FindingEvidence[];
}

export interface AnalysisRunData {
  id: string;
  agreement_id: string;
  status: string;
  model_id: string;
  model_provider: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_code?: string;
  error_message_safe?: string;
  operative_framework?: {
    master_agreement_id?: string;
    applicable_amendments?: string[];
    unresolved_amendments?: string[];
    amendment_reasoning?: string;
  };
}

interface CommercialIntelligencePanelProps {
  agreementId: string;
  buyerName: string;
  poNumber: string;
  onApplyToComparison?: (findings: IntelligenceFinding[]) => void;
  onOpenResolution?: () => void;
}

const STAGES = [
  { key: "retrieving_documents", label: "Retrieving documents", desc: "Fetching contract, amendments & PO from private storage" },
  { key: "preprocessing", label: "Preprocessing & indexing", desc: "Generating stable block coordinates across formats" },
  { key: "extracting_facts", label: "Extracting facts", desc: "Gemini 3.8 Flash structured commercial extraction" },
  { key: "reconciling_terms", label: "Reconciling hierarchy", desc: "Analyzing amendment effective dates vs PO terms" },
  { key: "validating_evidence", label: "Validating evidence", desc: "Deterministic quotation verification & arithmetic check" },
  { key: "saving_results", label: "Finalizing", desc: "Persisting audited intelligence findings" },
];

export function CommercialIntelligencePanel({
  agreementId,
  buyerName,
  poNumber,
  onApplyToComparison,
  onOpenResolution,
}: CommercialIntelligencePanelProps) {
  const { success, error: toastError } = useToast();

  const [loading, setLoading] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [disclosureModalOpen, setDisclosureModalOpen] = useState(false);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [notConfiguredError, setNotConfiguredError] = useState<string | null>(null);

  const [runData, setRunData] = useState<AnalysisRunData | null>(null);
  const [findings, setFindings] = useState<IntelligenceFinding[]>([]);

  // Poll or fetch latest analysis on load
  useEffect(() => {
    async function loadAnalysis() {
      try {
        const res = await fetch(`/api/agreements/${agreementId}/analysis`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.latest_run) {
            setRunData(json.data.latest_run);
            setFindings(json.data.findings || []);
          }
        }
      } catch {
        // offline or unauthenticated, handled gracefully
      }
    }
    loadAnalysis();
  }, [agreementId]);

  const handleStartAnalysis = async () => {
    setDisclosureModalOpen(false);
    setLoading(true);
    setNotConfiguredError(null);
    setCurrentStageIndex(0);

    // Simulate animated stage progression while server request is in flight
    const stageInterval = setInterval(() => {
      setCurrentStageIndex((prev) => (prev < STAGES.length - 1 ? prev + 1 : prev));
    }, 1200);

    try {
      const res = await fetch(`/api/agreements/${agreementId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_new: true }),
      });

      clearInterval(stageInterval);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 503 && errJson.code === "GEMINI_NOT_CONFIGURED") {
          setNotConfiguredError(errJson.error);
          setLoading(false);
          return;
        }
        throw new Error(errJson.error || `Analysis failed (${res.status})`);
      }

      const resData = await res.json();
      setCurrentStageIndex(STAGES.length - 1);

      if (resData.success && resData.data?.run_id) {
        // Fetch full results
        const runRes = await fetch(`/api/analysis/${resData.data.run_id}`);
        if (runRes.ok) {
          const runJson = await runRes.json();
          setRunData(runJson.data.run);
          setFindings(runJson.data.findings || []);
        }
        success("Commercial Analysis Complete", "Gemini 3.8 Flash reconciliation engine finished successfully.");
      }
    } catch (err: unknown) {
      toastError("Analysis Error", (err as Error).message || "An unexpected error occurred.");
    } finally {
      clearInterval(stageInterval);
      setLoading(false);
    }
  };

  const handleReviewAction = async (
    findingId: string,
    reviewStatus: "confirmed" | "dismissed" | "needs_more_information"
  ) => {
    if (!runData) return;

    try {
      const res = await fetch(`/api/analysis/${runData.id}/findings/${findingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_status: reviewStatus }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to update review status");
      }

      const json = await res.json();
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId ? { ...f, ...json.data } : f))
      );

      const labels = {
        confirmed: "Finding confirmed",
        dismissed: "Finding dismissed",
        needs_more_information: "Clarification requested",
      };
      success(labels[reviewStatus], "Human review recorded in immutable audit log.");
    } catch (err: unknown) {
      toastError("Review Action Failed", (err as Error).message);
    }
  };

  // Counts
  const matchedCount = findings.filter((f) => f.finding_type === "matched").length;
  const conflictCount = findings.filter((f) => f.finding_type === "conflict").length;
  const missingCount = findings.filter(
    (f) => f.finding_type === "missing_in_purchase_order" || f.finding_type === "missing_in_agreement"
  ).length;
  const ambiguousCount = findings.filter((f) => f.finding_type === "ambiguous").length;

  const reviewedCount = findings.filter(
    (f) => f.review_status && f.review_status !== "unreviewed"
  ).length;
  const allConflictsReviewed =
    conflictCount > 0 &&
    findings
      .filter((f) => f.finding_type === "conflict")
      .every((f) => f.review_status && f.review_status !== "unreviewed");

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6 shadow-sm">
      {/* Top Header / Metadata Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-content-primary">
                Commercial Document Intelligence
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                gemini-3.8-flash • thinking: medium
              </span>
            </div>
            <p className="text-xs text-content-secondary mt-0.5">
              Automated multi-document contract reconciliation with traceable quotation verification.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {runData ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />}
              onClick={() => setDisclosureModalOpen(true)}
              disabled={loading}
            >
              Re-run analysis
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkles className="w-3.5 h-3.5 text-blue-200" />}
              onClick={() => setDisclosureModalOpen(true)}
              disabled={loading}
            >
              Analyse commercial terms
            </Button>
          )}
        </div>
      </div>

      {/* Structured Diagnostic Notice when GEMINI_API_KEY is not configured */}
      {notConfiguredError && (
        <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Gemini Engine Not Configured (HTTP 503 GEMINI_NOT_CONFIGURED)
          </div>
          <p className="text-xs leading-relaxed text-amber-200/90">
            {notConfiguredError}
          </p>
          <div className="text-[11px] font-mono bg-app p-2.5 rounded border border-border text-content-secondary">
            To activate live analysis: add <span className="text-amber-300 font-semibold">GEMINI_API_KEY=your_key_here</span> to <span className="text-content-primary">.env.local</span> and restart the development server.
          </div>
        </div>
      )}

      {/* In-Flight Analysis Progress Indicator */}
      {loading && (
        <div className="mt-5 p-5 rounded-lg bg-app border border-border space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-content-primary flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
              Reconciling commercial documents...
            </span>
            <span className="text-xs font-mono text-content-muted">
              Stage {currentStageIndex + 1} of {STAGES.length}
            </span>
          </div>

          <div className="w-full bg-surface h-2 rounded-full overflow-hidden border border-border">
            <div
              className="bg-blue-600 h-full transition-all duration-500 ease-out"
              style={{ width: `${((currentStageIndex + 1) / STAGES.length) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2">
            {STAGES.map((st, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <div
                  key={st.key}
                  className={`p-2.5 rounded border text-[11px] transition-colors ${
                    isPast
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : isCurrent
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-300 font-medium animate-pulse"
                      : "bg-surface border-border text-content-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {isPast ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <span className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[9px]">
                        {idx + 1}
                      </span>
                    )}
                    <span className="truncate">{st.label}</span>
                  </div>
                  <p className="text-[10px] text-content-secondary line-clamp-2">{st.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty Initial State (Before Analysis) */}
      {!loading && !runData && !notConfiguredError && (
        <div className="mt-5 p-6 rounded-lg bg-app border border-dashed border-border text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
            <FileCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-content-primary">
              No commercial intelligence run recorded yet
            </h3>
            <p className="text-xs text-content-secondary max-w-md mx-auto">
              Extract and cross-verify commercial terms between Master Agreement ({agreementId}), any active amendments, and Purchase Order ({poNumber}).
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Sparkles className="w-3.5 h-3.5 text-blue-200" />}
            onClick={() => setDisclosureModalOpen(true)}
          >
            Analyse commercial terms
          </Button>
        </div>
      )}

      {/* Analysis Results View */}
      {!loading && runData && (
        <div className="mt-5 space-y-5">
          {/* Summary Stat Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-app border border-border">
              <span className="text-[11px] text-content-secondary block mb-1">Matched Terms</span>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-lg font-bold text-content-primary font-mono">{matchedCount}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-app border border-border">
              <span className="text-[11px] text-content-secondary block mb-1">Commercial Conflicts</span>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span className="text-lg font-bold text-rose-400 font-mono">{conflictCount}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-app border border-border">
              <span className="text-[11px] text-content-secondary block mb-1">Missing Conditions</span>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-lg font-bold text-amber-400 font-mono">{missingCount}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-app border border-border">
              <span className="text-[11px] text-content-secondary block mb-1">Ambiguous Amendments</span>
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                <span className="text-lg font-bold text-purple-400 font-mono">{ambiguousCount}</span>
              </div>
            </div>
          </div>

          {/* Operative Contract Hierarchy Card */}
          <div className="p-4 rounded-lg bg-app border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-content-primary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                Operative Commercial Framework
              </span>
              <span className="text-[11px] font-mono text-content-muted">
                Run ID: {runData.id.slice(0, 8)}...
              </span>
            </div>
            <div className="text-xs text-content-secondary space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-content-primary">Master Agreement:</span>
                <span className="font-mono text-blue-400">{agreementId}</span>
                <span className="text-content-muted">• {buyerName}</span>
              </div>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                Operative hierarchy evaluated by Gemini 3.8 Flash: Amendments take precedence over conflicting master clauses only when their effective date precedes the purchase order issuance date.
              </p>
            </div>
          </div>

          {/* Reconciled Finding Cards */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-content-primary uppercase tracking-wider">
                Reconciliation Findings ({findings.length})
              </h3>
              <span className="text-xs text-content-secondary">
                {reviewedCount} of {findings.length} findings reviewed
              </span>
            </div>

            {findings.map((finding) => {
              const isExpanded = expandedFindingId === finding.id;
              const isConflict = finding.finding_type === "conflict";

              const severityColors = {
                critical: "bg-rose-500/10 text-rose-400 border-rose-500/30",
                high: "bg-rose-500/10 text-rose-400 border-rose-500/30",
                medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                informational: "bg-slate-500/10 text-slate-400 border-slate-500/30",
              };

              const reviewBadgeColors = {
                confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                dismissed: "bg-slate-500/10 text-slate-400 border-slate-500/30",
                needs_more_information: "bg-amber-500/10 text-amber-400 border-amber-500/30",
                unreviewed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
              };

              return (
                <div
                  key={finding.id}
                  className={`rounded-lg border transition-all ${
                    isConflict
                      ? "bg-surface border-rose-500/30 hover:border-rose-500/50"
                      : "bg-surface border-border hover:border-border-hover"
                  }`}
                >
                  {/* Finding Main Card Header */}
                  <div className="p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-content-primary">
                          {finding.term_label}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary">
                          {finding.term_key}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border uppercase ${
                            severityColors[finding.severity] || severityColors.low
                          }`}
                        >
                          {finding.severity}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                            reviewBadgeColors[finding.review_status || "unreviewed"]
                          }`}
                        >
                          {finding.review_status === "confirmed" && "✓ Confirmed"}
                          {finding.review_status === "dismissed" && "Dismissed"}
                          {finding.review_status === "needs_more_information" && "Clarification Requested"}
                          {(!finding.review_status || finding.review_status === "unreviewed") && "Unreviewed"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-content-muted">
                          Confidence: {Math.round((finding.confidence || 0.9) * 100)}%
                        </span>
                        <button
                          onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                          className="p-1 text-content-muted hover:text-content-primary rounded hover:bg-app"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Value Comparison Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-xs">
                      <div className="p-2.5 rounded bg-app border border-border">
                        <span className="text-[10px] text-content-secondary block mb-1 font-medium">
                          Master Agreement
                        </span>
                        <div className="font-semibold text-content-primary">
                          {finding.agreement_value?.value || "Not specified"}
                        </div>
                        {finding.agreement_value?.clause && (
                          <span className="text-[10px] text-blue-400 block mt-1">
                            Clause: {finding.agreement_value.clause}
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 rounded bg-app border border-border">
                        <span className="text-[10px] text-content-secondary block mb-1 font-medium">
                          Operative Amendment
                        </span>
                        <div className="font-semibold text-content-primary">
                          {finding.amendment_value?.value || "No amendment applicable"}
                        </div>
                        {finding.amendment_value?.amendment_id && (
                          <span className="text-[10px] text-purple-400 block mt-1">
                            Ref: {finding.amendment_value.amendment_id}
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 rounded bg-app border border-border">
                        <span className="text-[10px] text-content-secondary block mb-1 font-medium">
                          Purchase Order ({poNumber})
                        </span>
                        <div
                          className={`font-semibold ${
                            isConflict ? "text-rose-400" : "text-content-primary"
                          }`}
                        >
                          {finding.purchase_order_value?.value || "Not specified"}
                        </div>
                      </div>
                    </div>

                    {/* Financial/Contractual Explanation */}
                    <p className="text-xs text-content-secondary leading-relaxed bg-app/50 p-2.5 rounded border border-border/50">
                      {finding.explanation}
                    </p>

                    {/* Human Review Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant={finding.review_status === "confirmed" ? "primary" : "secondary"}
                          size="sm"
                          icon={<Check className="w-3 h-3 text-emerald-400" />}
                          onClick={() => handleReviewAction(finding.id, "confirmed")}
                        >
                          Confirm
                        </Button>
                        <Button
                          variant={finding.review_status === "dismissed" ? "primary" : "secondary"}
                          size="sm"
                          icon={<X className="w-3 h-3 text-content-muted" />}
                          onClick={() => handleReviewAction(finding.id, "dismissed")}
                        >
                          Dismiss
                        </Button>
                        <Button
                          variant={finding.review_status === "needs_more_information" ? "primary" : "secondary"}
                          size="sm"
                          icon={<HelpCircle className="w-3 h-3 text-amber-400" />}
                          onClick={() => handleReviewAction(finding.id, "needs_more_information")}
                        >
                          Request info
                        </Button>
                      </div>

                      <button
                        onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                      >
                        {isExpanded ? "Hide evidence" : `View evidence (${finding.evidence?.length || 0})`}
                      </button>
                    </div>
                  </div>

                  {/* Expandable Traceable Evidence Viewer */}
                  {isExpanded && finding.evidence && finding.evidence.length > 0 && (
                    <div className="p-4 bg-app border-t border-border space-y-3 rounded-b-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-content-primary flex items-center gap-1.5 uppercase tracking-wider">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Source Evidence & Verification
                        </span>
                        <span className="text-[10px] text-content-muted">
                          Deterministic server-side quotation check
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {finding.evidence.map((ev, eIdx) => {
                          const statusLabels = {
                            verified_exact: { label: "Exact Match Verified", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                            verified_normalized: { label: "Normalized Match Verified", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
                            visually_located_unverified: { label: "Visually Located (Unverified)", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
                            not_found: { label: "Quote Not Found in Source", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
                            invalid_source: { label: "Invalid Source Reference", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
                          };

                          const badge = statusLabels[ev.verification_status] || statusLabels.not_found;

                          return (
                            <div
                              key={ev.id || eIdx}
                              className="p-3 rounded bg-surface border border-border space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-blue-400 text-[11px] font-medium">
                                  {ev.source_ref}
                                </span>
                                <span
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded border ${badge.color}`}
                                >
                                  {badge.label}
                                </span>
                              </div>

                              <blockquote className="border-l-2 border-blue-500/40 pl-3 py-1 text-content-secondary font-mono text-[11px] leading-relaxed italic bg-app/40 rounded-r">
                                &ldquo;{ev.quote}&rdquo;
                              </blockquote>

                              <div className="flex items-center gap-3 text-[10px] text-content-muted">
                                <span>Location: {ev.location_type}</span>
                                <span>Method: {ev.verification_method}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="text-xs text-blue-300">
              {allConflictsReviewed ? (
                <span className="font-medium text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  All commercial findings reviewed. You can now apply them to the workbench comparison table.
                </span>
              ) : (
                <span>
                  Confirm or dismiss the commercial findings to complete the intelligence review stage.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onApplyToComparison && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => {
                    onApplyToComparison(findings);
                    success("Comparison Table Synchronized", "Workbench terms updated with verified intelligence findings.");
                  }}
                >
                  Apply to comparison
                </Button>
              )}
              {allConflictsReviewed && onOpenResolution && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onOpenResolution}
                >
                  Open resolution drawer
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document Scope & AI Disclosure Modal */}
      {disclosureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface border border-border rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-semibold text-content-primary">
                  Commercial Intelligence Run Scope
                </h3>
              </div>
              <button
                onClick={() => setDisclosureModalOpen(false)}
                className="text-content-muted hover:text-content-primary p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-content-secondary leading-relaxed">
              <div className="space-y-1.5">
                <span className="font-semibold text-content-primary block text-[13px]">
                  Documents in Scope
                </span>
                <ul className="space-y-1 pl-4 list-disc text-content-secondary">
                  <li>Master Commercial Supply Agreement (<span className="font-mono text-content-primary">{agreementId}</span>)</li>
                  <li>All associated agreement amendments and riders</li>
                  <li>Purchase Order (<span className="font-mono text-content-primary">{poNumber}</span>) and line item specifications</li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1">
                <span className="font-semibold block flex items-center gap-1.5 text-blue-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Model & Architecture Disclosure
                </span>
                <p className="text-[11px] leading-relaxed text-blue-200/90">
                  Processed with <span className="font-mono font-semibold">gemini-3.8-flash</span> via the official Google Gen AI SDK (<span className="font-mono">@google/genai</span>) with <span className="font-mono">medium</span> thinking level.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-app border border-border space-y-1">
                <span className="font-semibold block text-content-primary">
                  Enterprise Data Privacy Notice
                </span>
                <p className="text-[11px] text-content-secondary leading-relaxed">
                  Document content is processed purely server-side for term extraction and reconciliation. No model training is performed on enterprise data. API keys are never leaked to client bundles.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDisclosureModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles className="w-3.5 h-3.5 text-blue-200" />}
                onClick={handleStartAnalysis}
              >
                Confirm & Run Analysis
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
