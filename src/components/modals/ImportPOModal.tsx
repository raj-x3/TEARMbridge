"use client";

import React, { useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";

interface ImportPOModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportPOModal: React.FC<ImportPOModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>("PO-8821_Meridian_Retail.pdf");
  const [isProcessing, setIsProcessing] = useState(false);
  const { success } = useToast();
  const router = useRouter();

  const handleSimulateImport = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onClose();
      success(
        "Purchase Order Imported Successfully",
        "PO-8821 matched with Master Supplier Agreement v2.1. Opening Agreement Workbench..."
      );
      router.push("/workspace/agreements/AGR-1042");
    }, 900);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Commercial Purchase Order"
      description="Upload inbound commercial PO documents (.pdf, .docx, .json) to run automated contract interpretation and term reconciliation."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Dropzone */}
        <div
          onClick={() => setSelectedFile("PO-8821_Meridian_Retail.pdf")}
          className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-8 text-center cursor-pointer bg-app/50 group"
        >
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-6 h-6 text-primary" />
          </div>
          <p className="text-xs font-semibold text-content-primary">
            Click to upload or drag & drop purchase order
          </p>
          <p className="text-[11px] text-content-muted mt-1">
            Standard B2B PO formats supported (PDF, XML, EDI 850, DOCX up to 25MB)
          </p>
        </div>

        {/* Preset sample files for easy testing */}
        <div>
          <span className="text-[11px] font-mono uppercase text-content-muted tracking-wider block mb-2">
            Or select sample demonstration document
          </span>
          <div className="space-y-2">
            {[
              {
                name: "PO-8821_Meridian_Retail.pdf",
                size: "420 KB",
                tag: "High Priority (Discount conflict)",
              },
              {
                name: "PO-8819_Apex_Distribution.pdf",
                size: "680 KB",
                tag: "Payment Terms Net 60",
              },
            ].map((file) => (
              <div
                key={file.name}
                onClick={() => setSelectedFile(file.name)}
                className={`p-3 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                  selectedFile === file.name
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-border bg-surface hover:bg-app text-content-primary"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-[11px] text-content-muted">
                    ({file.size})
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-border text-content-secondary">
                  {file.tag}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Prototype notice */}
        <div className="p-3 bg-app rounded-md border border-border text-[11px] text-content-secondary flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-content-muted shrink-0 mt-0.5" />
          <span>
            <strong>Prototype Note:</strong> In Module 1, document ingestion operates with pre-indexed verified contractual schemas. Document OCR and live PDF parsing will connect in subsequent modules.
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSimulateImport}
            isLoading={isProcessing}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Import & Reconcile
          </Button>
        </div>
      </div>
    </Modal>
  );
};
