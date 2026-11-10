"use client";

import React from "react";
import {
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CommercialTerm } from "@/types";

interface ReviewPanelProps {
  status: string;
  matchedCount: number;
  conflictCount: number;
  missingCount: number;
  selectedTerm: CommercialTerm | null;
  onOpenResolution: () => void;
  onOpenDocPreview: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  status,
  matchedCount,
  conflictCount,
  missingCount,
  selectedTerm,
  onOpenResolution,
  onOpenDocPreview,
}) => {
  return (
    <div className="bg-surface border border-border rounded-lg p-5 shadow-subtle space-y-5">
      {/* Header */}
      <div className="pb-3 border-b border-border flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-content-muted">
            Audit Assessment
          </span>
          <h3 className="text-sm font-semibold text-content-primary">
            Commercial Review
          </h3>
        </div>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* Structured Terms Breakdown */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2.5 rounded-md bg-[#F0FDF4] border border-[#DCFCE7]">
          <span className="text-base font-bold text-[#15803D] font-mono block">
            {matchedCount}
          </span>
          <span className="text-[10px] font-medium text-[#166534] uppercase tracking-wider">
            Matched
          </span>
        </div>
        <div className="p-2.5 rounded-md bg-[#FEF2F2] border border-[#FEE2E2]">
          <span className="text-base font-bold text-[#B91C1C] font-mono block">
            {conflictCount}
          </span>
          <span className="text-[10px] font-medium text-[#991B1B] uppercase tracking-wider">
            Conflicts
          </span>
        </div>
        <div className="p-2.5 rounded-md bg-[#FFFBEB] border border-[#FEF3C7]">
          <span className="text-base font-bold text-[#B45309] font-mono block">
            {missingCount}
          </span>
          <span className="text-[10px] font-medium text-[#92400E] uppercase tracking-wider">
            Missing/Pending
          </span>
        </div>
      </div>

      {/* Selected Term Detail or Primary Finding */}
      <div className="p-4 rounded-lg bg-app border border-border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-content-primary flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>Sample Contractual Analysis</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-border text-content-muted">
            DEMO ANALYSIS
          </span>
        </div>

        <p className="text-xs text-content-secondary leading-relaxed">
          The requested discount exceeds the agreed commercial threshold. The contract permits a 10% discount for qualifying quantities, while the purchase order requests 15% for 45 units.
        </p>

        {/* Source Reference Tag */}
        <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-content-secondary">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
            <span className="underline decoration-dotted cursor-pointer" onClick={onOpenDocPreview}>
              Clause 4.2 - Quantity Tiers & Discounts
            </span>
          </div>
          <button
            onClick={onOpenDocPreview}
            className="text-[11px] text-primary hover:underline font-medium inline-flex items-center gap-0.5"
          >
            <span>Inspect</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Active Focused Term Context if clicked */}
      {selectedTerm && (
        <div className="p-3 rounded-md bg-white border border-primary/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-content-primary">
              Focused: {selectedTerm.termName}
            </span>
            <StatusBadge status={selectedTerm.status} size="sm" />
          </div>
          <p className="text-[11px] text-content-secondary">
            {selectedTerm.notes}
          </p>
        </div>
      )}

      {/* Primary Action Button */}
      <div className="pt-2">
        <Button
          variant="primary"
          size="md"
          className="w-full justify-center"
          icon={<ArrowRight className="w-4 h-4" />}
          iconPosition="right"
          onClick={onOpenResolution}
        >
          Review and resolve conflicts
        </Button>
      </div>

      {/* Explanatory Prototype Disclaimer */}
      <p className="text-[11px] text-content-muted text-center leading-normal">
        * Static sample analysis for validation workflow prototype. Autonomous AI engine and parsing pipelines are scheduled for Module 2.
      </p>
    </div>
  );
};
