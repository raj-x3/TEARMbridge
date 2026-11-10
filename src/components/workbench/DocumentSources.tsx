"use client";

import React, { useState } from "react";
import { FileText, Eye } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { SOURCE_DOCUMENTS_AGR_1042 } from "@/data/mockData";
import { SourceDocument } from "@/types";

interface DocumentSourcesProps {
  onDocumentSelect?: (doc: SourceDocument) => void;
}

export const DocumentSources: React.FC<DocumentSourcesProps> = ({
  onDocumentSelect,
}) => {
  const [selectedDoc, setSelectedDoc] = useState<SourceDocument | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleOpenDoc = (doc: SourceDocument) => {
    setSelectedDoc(doc);
    setModalOpen(true);
    if (onDocumentSelect) onDocumentSelect(doc);
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-5 shadow-subtle">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">
            Source Documents & Agreements
          </h3>
          <p className="text-xs text-content-secondary mt-0.5">
            Indexed contractual instruments governing this commercial transaction
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-muted">
          3 Documents Verified
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SOURCE_DOCUMENTS_AGR_1042.map((doc) => (
          <div
            key={doc.id}
            onClick={() => handleOpenDoc(doc)}
            className="group p-3.5 rounded-lg border border-border hover:border-primary/60 bg-surface hover:bg-[#FAFAF8] cursor-pointer transition-all duration-150 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="w-8 h-8 rounded bg-app border border-border flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
                <StatusBadge status={doc.verificationState} size="sm" />
              </div>

              <h4 className="text-xs font-semibold text-content-primary group-hover:text-primary transition-colors line-clamp-1">
                {doc.name}
              </h4>

              <div className="flex items-center gap-2 mt-2 text-[11px] text-content-muted font-mono">
                <span className="px-1.5 py-0.5 bg-app border border-border rounded text-content-secondary font-semibold">
                  {doc.fileType}
                </span>
                <span>{doc.version}</span>
                <span>•</span>
                <span>{doc.size}</span>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border-subtle flex items-center justify-between text-[11px]">
              <span className="text-content-muted">
                Updated {doc.lastUpdated}
              </span>
              <span className="inline-flex items-center gap-1 text-primary font-medium group-hover:translate-x-0.5 transition-transform">
                <span>View</span>
                <Eye className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <DocumentPreviewModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        document={selectedDoc}
        allDocuments={SOURCE_DOCUMENTS_AGR_1042}
        onSelectDocument={setSelectedDoc}
      />
    </div>
  );
};
