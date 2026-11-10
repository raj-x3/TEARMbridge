"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ResolutionDrawer } from "@/components/workbench/ResolutionDrawer";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import { ATTENTION_QUEUE } from "@/data/mockData";
import { AttentionItem } from "@/types";
import { AnimatePresence, motion } from "framer-motion";

export const AttentionQueue: React.FC = () => {
  const { success } = useToast();
  const [items, setItems] = useState<AttentionItem[]>(ATTENTION_QUEUE);
  const [activeItem, setActiveItem] = useState<AttentionItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleOpenResolve = (item: AttentionItem) => {
    setActiveItem(item);
    setDrawerOpen(true);
  };

  const handleResolutionApplied = (resolutionType: string) => {
    if (!activeItem) return;
    setItems((prev) => prev.filter((i) => i.id !== activeItem.id));
    success(
      "Attention Item Resolved",
      `Variance on ${activeItem.poNumber} (${activeItem.buyerName}) resolved via ${resolutionType}. Removed from pending queue.`
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-content-primary tracking-tight">
            Needs your attention
          </h2>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] font-medium">
            {items.length} {items.length === 1 ? "item requires action" : "items require action"}
          </span>
        </div>
        <span className="text-xs text-content-muted hidden sm:inline">
          High-priority commercial conflicts & pending approvals
        </span>
      </div>

      {items.length === 0 ? (
        <div className="p-6 bg-surface border border-dashed border-border rounded-lg text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
          <p className="text-xs font-semibold text-content-primary">
            All priority attention items resolved
          </p>
          <p className="text-[11px] text-content-muted mt-0.5">
            No active commercial variances currently exceed configured tolerance guardrails.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <AnimatePresence>
            {items.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                className="group relative bg-surface border border-border rounded-lg p-4 transition-all duration-200 hover:border-border-strong hover:shadow-subtle flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <StatusBadge status={item.priority} size="sm" />
                    <span className="text-[11px] font-mono text-content-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.lastUpdated}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span className="text-xs font-semibold text-content-primary line-clamp-1 group-hover:text-primary transition-colors">
                      {item.poNumber} — {item.title}
                    </span>
                    <p className="text-[11px] text-content-secondary line-clamp-2 mt-1 leading-relaxed">
                      {item.reason}
                    </p>
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-border-subtle flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-content-muted uppercase tracking-wider block">
                      {item.buyerName}
                    </span>
                    <span className="text-xs font-mono font-semibold text-content-primary tabular-nums">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => handleOpenResolve(item)}
                    >
                      Resolve
                    </Button>
                    <Link
                      href={`/workspace/agreements/${item.agreementId}`}
                      className="p-1 rounded text-content-muted hover:text-primary transition-colors hover:bg-app"
                      title="Open full workbench"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Quick Resolution Drawer */}
      <ResolutionDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onResolutionApplied={handleResolutionApplied}
      />
    </section>
  );
};
