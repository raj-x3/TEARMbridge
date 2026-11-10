"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TransactionTimeline } from "@/components/workbench/TransactionTimeline";
import { DocumentSources } from "@/components/workbench/DocumentSources";
import { TermsComparison } from "@/components/workbench/TermsComparison";
import { ReviewPanel } from "@/components/workbench/ReviewPanel";
import { ResolutionDrawer } from "@/components/workbench/ResolutionDrawer";
import { DocumentPreviewModal } from "@/components/workbench/DocumentPreviewModal";
import { useToast } from "@/components/ui/Toast";
import {
  COMMERCIAL_TERMS_AGR_1042,
  SOURCE_DOCUMENTS_AGR_1042,
  TRANSACTIONS,
} from "@/data/mockData";
import { CommercialTerm, SourceDocument } from "@/types";

export default function AgreementWorkbenchPage({
  params,
}: {
  params: { id: string };
}) {
  const { success } = useToast();
  const agreementId = params.id || "AGR-1042";
  const matchedTx = TRANSACTIONS.find((t) => t.agreementId === agreementId);
  const buyerName = matchedTx?.buyer || "Meridian Retail";
  const poNumber = matchedTx?.poNumber || "PO-8821";

  const [currentStatus, setCurrentStatus] = useState<string>(
    matchedTx?.stage || "needs_review"
  );
  const [terms, setTerms] = useState<CommercialTerm[]>(COMMERCIAL_TERMS_AGR_1042);
  const [selectedTerm, setSelectedTerm] = useState<CommercialTerm | null>(COMMERCIAL_TERMS_AGR_1042[2]); // discount term focused by default
  const [resolutionDrawerOpen, setResolutionDrawerOpen] = useState(false);
  const [docPreviewModalOpen, setDocPreviewModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<SourceDocument>(SOURCE_DOCUMENTS_AGR_1042[0]);

  const handleExportSummary = () => {
    success(
      "Commercial Summary Exported",
      `Audit package for ${agreementId} (${buyerName}) generated and ready for legal archive.`
    );
  };

  const handleResolutionApplied = (type: string) => {
    if (type === "counteroffer") {
      setCurrentStatus("counteroffer_sent");
      // update discount term
      setTerms((prev) =>
        prev.map((t) =>
          t.id === "term-3"
            ? { ...t, status: "needs_confirmation", buyerRequest: "10% (Countered)" }
            : t
        )
      );
    } else if (type === "waiver") {
      setCurrentStatus("ready_to_invoice");
      setTerms((prev) =>
        prev.map((t) => (t.id === "term-3" ? { ...t, status: "matched" } : t))
      );
    }
  };

  const matchedCount = terms.filter((t) => t.status === "matched").length;
  const conflictCount = terms.filter((t) => t.status === "conflict").length;
  const missingCount = terms.filter((t) => t.status === "needs_confirmation").length;

  return (
    <div className="space-y-6">
      {/* Flagship Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Link
              href="/workspace/overview"
              className="text-content-muted hover:text-content-primary p-1.5 rounded-md hover:bg-surface border border-transparent hover:border-border transition-colors"
              title="Return to Overview"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-content-primary font-mono">
                {agreementId}
              </h1>
              <span className="text-content-muted font-normal text-sm sm:text-base">
                — {buyerName}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary">
                PO: {poNumber}
              </span>
              <StatusBadge status={currentStatus} />
            </div>
          </div>
          <p className="text-xs text-content-secondary pl-8 leading-relaxed">
            Commercial agreement workbench • Industrial Fluid Sensor procurement reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2.5 pl-8 lg:pl-0">
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={handleExportSummary}
          >
            Export summary
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Sliders className="w-3.5 h-3.5" />}
            onClick={() => setResolutionDrawerOpen(true)}
          >
            Review agreement
          </Button>
        </div>
      </div>

      {/* D. TRANSACTION TIMELINE */}
      <TransactionTimeline />

      {/* A. DOCUMENT SOURCES */}
      <DocumentSources
        onDocumentSelect={(doc) => {
          setPreviewDoc(doc);
          setDocPreviewModalOpen(true);
        }}
      />

      {/* Main Grid: B. Terms Comparison (Left 2 cols) & C. Review Panel (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <TermsComparison
            terms={terms}
            selectedTermId={selectedTerm?.id || null}
            onSelectTerm={(term) => setSelectedTerm(term)}
            onResolveTerm={() => setResolutionDrawerOpen(true)}
          />
        </div>

        <div className="lg:col-span-1">
          <ReviewPanel
            status={currentStatus}
            matchedCount={matchedCount}
            conflictCount={conflictCount}
            missingCount={missingCount}
            selectedTerm={selectedTerm}
            onOpenResolution={() => setResolutionDrawerOpen(true)}
            onOpenDocPreview={() => {
              setPreviewDoc(SOURCE_DOCUMENTS_AGR_1042[0]);
              setDocPreviewModalOpen(true);
            }}
          />
        </div>
      </div>

      {/* Interactive Resolution Drawer */}
      <ResolutionDrawer
        isOpen={resolutionDrawerOpen}
        onClose={() => setResolutionDrawerOpen(false)}
        onResolutionApplied={handleResolutionApplied}
      />

      {/* Interactive Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={docPreviewModalOpen}
        onClose={() => setDocPreviewModalOpen(false)}
        document={previewDoc}
        allDocuments={SOURCE_DOCUMENTS_AGR_1042}
        onSelectDocument={setPreviewDoc}
      />
    </div>
  );
}
