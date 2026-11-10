"use client";

import React from "react";
import Link from "next/link";
import { Clock, ArrowRight, ShieldCheck, FileText, Send, CheckCircle, Receipt } from "lucide-react";
import { ACTIVITY_EVENTS } from "@/data/mockData";

export const ActivityTimelinePanel: React.FC = () => {
  const getActionIcon = (action: string) => {
    if (action.includes("uploaded")) return FileText;
    if (action.includes("analysed")) return ShieldCheck;
    if (action.includes("proposed")) return Send;
    if (action.includes("approved")) return CheckCircle;
    if (action.includes("invoice") || action.includes("sent")) return Receipt;
    return Clock;
  };

  return (
    <div className="bg-surface border border-border rounded-lg p-5 shadow-subtle flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-content-primary">
              Recent Commercial Activity
            </h3>
            <p className="text-[11px] text-content-secondary">
              Recent commercial activity
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app border border-border-subtle text-content-muted">
            DEMO STREAM
          </span>
        </div>

        <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-border">
          {ACTIVITY_EVENTS.slice(0, 5).map((event) => {
            const Icon = getActionIcon(event.action);
            const isSimulated = event.action.includes("Simulated") || event.eventDescription.includes("Simulated");

            return (
              <div key={event.id} className="relative pl-7 text-xs">
                {/* Node icon */}
                <div className="absolute left-1.5 top-0.5 -translate-x-1/2 w-4 h-4 rounded-full bg-surface border border-border flex items-center justify-center text-content-muted">
                  <Icon className="w-2.5 h-2.5 text-primary" />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-content-primary truncate">
                      {event.action}
                    </span>
                    {isSimulated && (
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                        Simulated
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-content-muted shrink-0">
                    {event.timestamp}
                  </span>
                </div>

                <p className="text-content-secondary text-[11px] mt-0.5 leading-relaxed">
                  {event.eventDescription}
                </p>

                <div className="mt-1 flex items-center gap-2 text-[10px] text-content-muted font-mono">
                  <span>Actor: {event.actor}</span>
                  <span>•</span>
                  <span className="text-primary font-medium">
                    {event.relatedAgreement}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[10px] font-mono text-content-muted">
          All entries simulated for prototype
        </span>
        <Link
          href="/workspace/activity"
          className="text-xs font-medium text-primary hover:text-primary-hover inline-flex items-center gap-1"
        >
          <span>View all activity</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
