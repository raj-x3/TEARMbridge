"use client";

import React, { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface ResolutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onResolutionApplied: (resolutionType: string) => void;
}

export const ResolutionDrawer: React.FC<ResolutionDrawerProps> = ({
  isOpen,
  onClose,
  onResolutionApplied,
}) => {
  const { success } = useToast();
  const [selectedResolution, setSelectedResolution] = useState<string>("counteroffer");
  const [notes, setNotes] = useState("Align with Clause 4.2 volume threshold to protect gross margin.");

  const handleApply = () => {
    onResolutionApplied(selectedResolution);
    success(
      "Commercial Resolution Recorded",
      selectedResolution === "counteroffer"
        ? "Counteroffer drafted: 10% discount conditioned upon 50 units order quantity."
        : "Commercial exception approved and recorded to audit trail."
    );
    onClose();
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Resolve Commercial Conflicts"
      subtitle="Agreement AGR-1042 • Meridian Retail PO-8821"
      width="lg"
    >
      <div className="space-y-6 text-xs">
        {/* Identified Discrepancies Summary */}
        <div className="p-4 rounded-lg bg-[#FFF7ED] border border-[#FFEDD5] text-[#C2410C]">
          <div className="flex items-center gap-2 font-semibold text-xs mb-1">
            <ShieldAlert className="w-4 h-4" />
            <span>Active Contractual Variance Detected</span>
          </div>
          <p className="text-[11px] text-[#9A3412] leading-relaxed">
            PO-8821 requests a 15.00% promotional discount on 45 units. Master Supplier Agreement Clause 4.2 limits discounts to 10.00% and strictly enforces a 50-unit minimum threshold.
          </p>
        </div>

        {/* Resolution Strategies */}
        <div className="space-y-3">
          <label className="font-semibold text-content-primary block uppercase tracking-wider text-[11px] font-mono">
            Select Commercial Resolution Path
          </label>

          <div className="space-y-2.5">
            {/* Option 1: Structured Counteroffer */}
            <div
              onClick={() => setSelectedResolution("counteroffer")}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                selectedResolution === "counteroffer"
                  ? "border-primary bg-primary-subtle ring-1 ring-primary/30"
                  : "border-border bg-surface hover:bg-app"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-content-primary">
                  1. Issue Structured Counteroffer (Recommended)
                </span>
                <span className="text-[10px] font-mono text-primary font-medium">
                  Preserves Margin
                </span>
              </div>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                Transmit a formal counteroffer proposing 10% discount on 50 units ($4,500 net), or standard list price ($100/unit) for 45 units.
              </p>
            </div>

            {/* Option 2: Commercial Waiver */}
            <div
              onClick={() => setSelectedResolution("waiver")}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                selectedResolution === "waiver"
                  ? "border-primary bg-primary-subtle ring-1 ring-primary/30"
                  : "border-border bg-surface hover:bg-app"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-content-primary">
                  2. Authorize One-Time Discretionary Waiver
                </span>
                <span className="text-[10px] font-mono text-content-muted">
                  Requires Admin Signoff
                </span>
              </div>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                Approve buyer&apos;s requested 15% discount for 45 units ($3,825 net) as a strategic relationship concession.
              </p>
            </div>

            {/* Option 3: Request Revised PO */}
            <div
              onClick={() => setSelectedResolution("revise")}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                selectedResolution === "revise"
                  ? "border-primary bg-primary-subtle ring-1 ring-primary/30"
                  : "border-border bg-surface hover:bg-app"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-content-primary">
                  3. Request Inbound PO Resubmission
                </span>
                <span className="text-[10px] font-mono text-content-muted">
                  Returns to Buyer
                </span>
              </div>
              <p className="text-[11px] text-content-secondary leading-relaxed">
                Reject conflicting terms without counteroffer. Ask Meridian Retail procurement desk to issue a compliant purchase order.
              </p>
            </div>
          </div>
        </div>

        {/* Audit Memo */}
        <div className="space-y-1.5">
          <label className="font-medium text-content-primary block text-[11px]">
            Commercial Audit Memo / Justification Note
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full p-2.5 bg-app border border-border rounded-md text-content-primary outline-none focus:border-primary text-xs"
            placeholder="Add internal notes for legal & finance ops..."
          />
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-border flex items-center justify-end gap-2.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Confirm Resolution & Update
          </Button>
        </div>
      </div>
    </Drawer>
  );
};
