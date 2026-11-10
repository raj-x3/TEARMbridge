"use client";

import React from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CommercialTerm } from "@/types";
import { cn } from "@/lib/utils";

interface TermsComparisonProps {
  terms: CommercialTerm[];
  selectedTermId: string | null;
  onSelectTerm: (term: CommercialTerm) => void;
  onResolveTerm?: (term: CommercialTerm) => void;
}

export const TermsComparison: React.FC<TermsComparisonProps> = ({
  terms,
  selectedTermId,
  onSelectTerm,
  onResolveTerm,
}) => {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden shadow-subtle">
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-content-primary">
            Commercial Terms Reconciliation
          </h3>
          <p className="text-xs text-content-secondary mt-0.5">
            Cross-comparison between Master Supplier Agreement and Inbound PO-8821
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            2 Matched
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium">
            2 Conflicts
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
            1 Needs Conf.
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-[#FAFAF8] text-content-muted font-medium uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Commercial Term</th>
              <th className="py-3 px-4">Contract Requirement</th>
              <th className="py-3 px-4">Buyer&apos;s Request (PO)</th>
              <th className="py-3 px-4">Validation Status</th>
              <th className="py-3 px-4">Governing Clause</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {terms.map((term) => {
              const isSelected = term.id === selectedTermId;
              const isConflict = term.status === "conflict";
              const isNeedsConfirmation = term.status === "needs_confirmation";
              const isMatched = term.status === "matched";

              return (
                <tr
                  key={term.id}
                  onClick={() => onSelectTerm(term)}
                  className={cn(
                    "cursor-pointer transition-colors duration-150 group",
                    isSelected
                      ? "bg-[#EFF4FF] ring-1 ring-inset ring-primary/40"
                      : isConflict
                      ? "hover:bg-[#FEF9F8]"
                      : "hover:bg-[#FAFAF8]"
                  )}
                >
                  <td className="py-3.5 px-4 font-semibold text-content-primary">
                    <div className="flex items-center gap-2">
                      {isConflict && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      )}
                      {isNeedsConfirmation && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                      )}
                      {isMatched && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      <span>{term.termName}</span>
                    </div>
                  </td>

                  <td className="py-3.5 px-4 font-mono text-content-secondary">
                    {term.contractRequirement}
                  </td>

                  <td className="py-3.5 px-4 font-mono font-medium text-content-primary">
                    <span
                      className={cn(
                        isConflict && "text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60 font-semibold"
                      )}
                    >
                      {term.buyerRequest}
                    </span>
                  </td>

                  <td className="py-3.5 px-4">
                    <StatusBadge status={term.status} />
                  </td>

                  <td className="py-3.5 px-4 font-mono text-[11px] text-content-muted">
                    {term.clauseRef || "General Terms"}
                  </td>

                  <td className="py-3.5 px-4 text-right">
                    {isConflict || isNeedsConfirmation ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTerm(term);
                          if (onResolveTerm) onResolveTerm(term);
                        }}
                        className="text-xs font-medium text-primary hover:text-primary-hover px-2 py-1 rounded bg-primary-subtle hover:bg-primary-subtle/80 transition-colors"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-[11px] text-content-muted font-mono">
                        Locked
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-border-subtle bg-app flex items-center justify-between text-[11px] text-content-muted">
        <span>Click any row to view clause details and source analysis</span>
        <span className="font-mono">5 Terms Indexed</span>
      </div>
    </div>
  );
};
