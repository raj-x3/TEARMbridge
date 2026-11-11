"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Database,
  FileCheck,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/config";

interface ImportPOModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPOSaved?: () => void;
}

export const ImportPOModal: React.FC<ImportPOModalProps> = ({
  isOpen,
  onClose,
  onPOSaved,
}) => {
  const router = useRouter();
  const { success, error: toastError, info } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [configured, setConfigured] = useState<boolean>(false);
  const [selectedSample, setSelectedSample] = useState<string | null>("PO-8821_Meridian_Retail.pdf");
  const [realFile, setRealFile] = useState<File | null>(null);

  // Form fields for PO creation
  const [poNumber, setPoNumber] = useState("PO-8825");
  const [buyerName, setBuyerName] = useState("Meridian Retail");
  const [buyerId, setBuyerId] = useState<string>("");
  const [amount, setAmount] = useState<number>(3400);
  const [currency, setCurrency] = useState("USD");
  const [deliveryDate, setDeliveryDate] = useState("2026-11-20");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");

  const [counterparties, setCounterparties] = useState<Array<{ id: string; display_name: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const isConf = isSupabaseConfigured();
    setConfigured(isConf);

    if (isConf && isOpen) {
      fetch("/api/counterparties")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setCounterparties(data.data);
            if (data.data.length > 0) {
              setBuyerId(data.data[0].id);
              setBuyerName(data.data[0].display_name);
            }
          }
        })
        .catch((err) => console.error("Error fetching counterparties:", err));
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setRealFile(file);
      setSelectedSample(null);
      setErrorMessage(null);
    }
  };

  const handleImport = async () => {
    setErrorMessage(null);

    // MODE A: Supabase not configured (Demo Mode)
    if (!configured) {
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        onClose();
        success(
          "Purchase Order Imported Successfully",
          "PO-8821 matched with Master Supplier Agreement v2.1. Opening Agreement Workbench..."
        );
        router.push("/workspace/agreements/AGR-1042");
      }, 700);
      return;
    }

    // MODE B: Supabase configured (Real Database & Document Upload)
    if (!poNumber.trim()) {
      setErrorMessage("Purchase order number is required.");
      return;
    }
    if (!buyerId && counterparties.length > 0) {
      setErrorMessage("Please select a buyer counterparty.");
      return;
    }

    setIsProcessing(true);

    try {
      const targetBuyerId = buyerId || (counterparties[0]?.id ?? null);
      if (!targetBuyerId) {
        throw new Error("No counterparty available. Please create a buyer first in Buyers & Suppliers.");
      }

      const poPayload = {
        po_number: poNumber.trim(),
        buyer_id: targetBuyerId,
        currency,
        subtotal: Number(amount) || 0,
        tax_amount: 0,
        shipping_amount: 0,
        total_amount: Number(amount) || 0,
        requested_delivery_date: deliveryDate || null,
        requested_payment_terms: paymentTerms || null,
        notes: "Imported via Purchase Order Ingestion Modal",
        line_items: [
          {
            product_name: "Inbound Commercial Order Line Item",
            quantity: 1,
            unit_price: Number(amount) || 0,
            line_total: Number(amount) || 0,
          },
        ],
      };

      const poRes = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(poPayload),
      });

      const poData = await poRes.json();
      if (!poRes.ok || !poData.success) {
        throw new Error(poData.error || "Failed to create purchase order in database.");
      }

      const createdPO = poData.data;

      // Attach file if uploaded
      if (realFile) {
        const formData = new FormData();
        formData.append("file", realFile);
        formData.append("entity_type", "purchase_order");
        formData.append("entity_id", createdPO.id);
        formData.append("relationship_type", "source");
        formData.append("document_type", "purchase_order");
        formData.append("title", realFile.name);

        const uploadRes = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          if (uploadRes.status === 409) {
            info(
              "PO Created with Duplicate Document Reference",
              `Purchase order ${createdPO.po_number} was created. The uploaded document identical checksum already exists in workspace.`
            );
          } else {
            toastError(
              "PO Created but Document Upload Failed",
              uploadData.error || "Could not save document attachment to storage."
            );
          }
        }
      }

      success(
        "Purchase Order Persisted Successfully",
        `Created ${createdPO.po_number} in PostgreSQL database ($${createdPO.total_amount}).`
      );

      if (onPOSaved) onPOSaved();
      onClose();
      router.push("/workspace/orders");
      router.refresh();
    } catch (err: unknown) {
      console.error("Import error:", err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred during import.";
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Commercial Purchase Order"
      description="Upload inbound commercial PO documents (.pdf, .docx, .xlsx, .csv) to index into commercial records."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Database Mode vs Demo Mode Notice */}
        {!configured ? (
          <div className="p-3 bg-[#FFFBEB] rounded-md border border-[#FDE68A] text-[11px] text-[#92400E] flex items-start gap-2">
            <Database className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
            <span>
              <strong>Demo Mode:</strong> Supabase is not connected. This action will demonstrate the reconciliation flow using mock records without persisting to a live database.
            </span>
          </div>
        ) : (
          <div className="p-2.5 bg-emerald-50 rounded-md border border-emerald-200 text-[11px] text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Database Mode:</strong> PO and uploaded documents will be persisted to PostgreSQL and private Supabase storage.
            </span>
          </div>
        )}

        {/* File Dropzone */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.csv,.txt"
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-6 text-center cursor-pointer bg-app/50 group"
        >
          <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-2 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-5 h-5 text-primary" />
          </div>
          {realFile ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary">
              <FileCheck className="w-4 h-4" />
              <span>{realFile.name} ({(realFile.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRealFile(null);
                  setSelectedSample("PO-8821_Meridian_Retail.pdf");
                }}
                className="text-content-muted hover:text-red-500 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-content-primary">
                Click to browse or drag & drop document
              </p>
              <p className="text-[11px] text-content-muted mt-1">
                Supported formats: PDF, DOCX, XLSX, CSV, TXT (Max 10 MB)
              </p>
            </>
          )}
        </div>

        {/* Real PO Metadata Form Fields (Active when Supabase is configured) */}
        {configured && (
          <div className="grid grid-cols-2 gap-3 text-xs bg-app/40 p-3 rounded-lg border border-border">
            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                PO Number *
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-8825"
                className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Buyer Counterparty *
              </label>
              {counterparties.length > 0 ? (
                <select
                  value={buyerId}
                  onChange={(e) => {
                    setBuyerId(e.target.value);
                    const cp = counterparties.find((c) => c.id === e.target.value);
                    if (cp) setBuyerName(cp.display_name);
                  }}
                  className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary"
                >
                  {counterparties.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.display_name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary"
                />
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Total Amount *
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0"
                step="50"
                className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary font-mono"
              >
                <option value="USD">USD ($)</option>
                <option value="CAD">CAD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Requested Delivery Date
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-content-secondary mb-1">
                Payment Terms Requested
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Net 30"
                className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-xs text-content-primary focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* Preset sample files for easy testing (Module 1 testing preservation) */}
        {!realFile && (
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
                  onClick={() => {
                    setSelectedSample(file.name);
                    setRealFile(null);
                  }}
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    selectedSample === file.name
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
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
          <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            isLoading={isProcessing}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            {configured ? "Save & Index Purchase Order" : "Import & Reconcile"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
