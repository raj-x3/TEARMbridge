"use client";

import React from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SourceDocument } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: SourceDocument | null;
  allDocuments: SourceDocument[];
  onSelectDocument: (doc: SourceDocument) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  allDocuments,
  onSelectDocument,
}) => {
  if (!document) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={document.name}
      description={`Version ${document.version} • Last updated ${document.lastUpdated} • File size ${document.size}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* Document Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto">
          {allDocuments.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onSelectDocument(doc)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                doc.id === document.id
                  ? "bg-primary text-white"
                  : "bg-app hover:bg-[#EFEFEA] text-content-secondary border border-border"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{doc.name}</span>
              <span className="font-mono text-[10px] opacity-80">
                {doc.fileType}
              </span>
            </button>
          ))}
        </div>

        {/* Verification Banner */}
        <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <StatusBadge status={document.verificationState} />
            <span className="text-content-secondary">
              Cryptographically verified against Northstar contract vault
            </span>
          </div>
          <span className="text-xs font-mono text-content-muted">
            {document.clausesCount} indexed clauses
          </span>
        </div>

        {/* Document Viewer Body */}
        <div className="border border-border rounded-lg bg-[#FAF8F5] p-6 text-content-primary max-h-[55vh] overflow-y-auto space-y-6 shadow-inner font-serif text-sm">
          <div className="border-b border-[#E3DFD7] pb-4 text-center">
            <h2 className="text-base font-bold font-sans text-content-primary tracking-tight">
              {document.content.title}
            </h2>
            <p className="text-xs text-content-muted font-sans mt-1">
              Official Legal & Commercial Transaction Repository Record
            </p>
          </div>

          <div className="space-y-5">
            {document.content.sections.map((sec, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded border transition-colors ${
                  sec.isHighlighted
                    ? "bg-[#FEFCE8] border-[#FEF08A] text-amber-950"
                    : "bg-white border-[#E7E4DC] text-content-primary"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5 font-sans">
                  <span className="font-semibold text-xs tracking-tight">
                    {sec.heading}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary">
                    {sec.clauseRef}
                  </span>
                </div>
                <p className="text-xs sm:text-[13px] leading-relaxed text-content-secondary font-sans">
                  {sec.body}
                </p>
                {sec.isHighlighted && (
                  <div className="mt-2 pt-2 border-t border-[#FEF08A] font-sans text-[11px] text-amber-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Cross-referenced against PO-8821 commercial terms</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <span className="text-content-muted font-mono">
            Document ID: {document.id}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close Viewer
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
