"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  name: string;
  status: "completed" | "current" | "upcoming";
  date?: string;
}

export const TransactionTimeline: React.FC = () => {
  const steps: Step[] = [
    { id: "s1", name: "PO Received", status: "completed", date: "Nov 08" },
    { id: "s2", name: "Documents Reviewed", status: "completed", date: "Nov 08" },
    { id: "s3", name: "Commercial Validation", status: "current", date: "Today" },
    { id: "s4", name: "Counteroffer", status: "upcoming" },
    { id: "s5", name: "Mutual Approval", status: "upcoming" },
    { id: "s6", name: "PayPal Invoice", status: "upcoming" },
    { id: "s7", name: "Settlement", status: "upcoming" },
  ];

  return (
    <div className="bg-surface border border-border rounded-lg p-4 sm:p-5 shadow-subtle">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-content-muted">
            Lifecycle Progress
          </span>
          <h3 className="text-xs sm:text-sm font-semibold text-content-primary">
            Commercial Agreement to Settlement Pipeline
          </h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-primary-subtle text-primary border border-primary/20">
          Stage 3 of 7: In Review
        </span>
      </div>

      <div className="relative">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {steps.map((step, idx) => {
            const isCompleted = step.status === "completed";
            const isCurrent = step.status === "current";
            const isUpcoming = step.status === "upcoming";

            return (
              <div
                key={step.id}
                className={cn(
                  "relative flex flex-col p-2.5 rounded-md border transition-all text-xs",
                  isCurrent && "border-primary bg-primary-subtle/50 shadow-subtle ring-1 ring-primary/20",
                  isCompleted && "border-border bg-app/50",
                  isUpcoming && "border-border/60 bg-surface/50 opacity-60"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono",
                      isCompleted && "bg-emerald-600 text-white",
                      isCurrent && "bg-primary text-white animate-pulse",
                      isUpcoming && "bg-app text-content-muted border border-border"
                    )}
                  >
                    {isCompleted ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                  {step.date && (
                    <span className="text-[10px] font-mono text-content-muted">
                      {step.date}
                    </span>
                  )}
                </div>

                <span
                  className={cn(
                    "font-medium truncate",
                    isCurrent && "text-primary font-semibold",
                    isCompleted && "text-content-primary",
                    isUpcoming && "text-content-muted"
                  )}
                >
                  {step.name}
                </span>

                <span className="text-[10px] text-content-muted capitalize mt-0.5 font-mono">
                  {step.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
