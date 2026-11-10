"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  FileCheck2,
  DollarSign,
  Activity,
  ArrowRight,
  ShieldCheck,
  Building2,
  X,
  Layers,
  Settings,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface CommandSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Agreements" | "Purchase Orders" | "Invoices";
  icon: React.ElementType;
  route: string;
  badge?: string;
  subtitle?: string;
}

const COMMAND_ITEMS: CommandItem[] = [
  // Navigation
  {
    id: "nav-overview",
    title: "Commercial Overview",
    category: "Navigation",
    icon: Layers,
    route: "/workspace/overview",
    subtitle: "Dashboard metrics & priority queue",
  },
  {
    id: "nav-po",
    title: "Purchase Orders",
    category: "Navigation",
    icon: FileText,
    route: "/workspace/orders",
    subtitle: "Inbound PO index & processing states",
  },
  {
    id: "nav-agreements",
    title: "Agreement Workbench (AGR-1042)",
    category: "Navigation",
    icon: FileCheck2,
    route: "/workspace/agreements/AGR-1042",
    badge: "Flagship",
    subtitle: "Source documents & term validation",
  },
  {
    id: "nav-counteroffers",
    title: "Counteroffers & Negotiations",
    category: "Navigation",
    icon: Activity,
    route: "/workspace/counteroffers",
    subtitle: "Active commercial term negotiations",
  },
  {
    id: "nav-invoices",
    title: "Invoices Management",
    category: "Navigation",
    icon: DollarSign,
    route: "/workspace/invoices",
    subtitle: "PayPal invoice tracking & settlements",
  },
  {
    id: "nav-activity",
    title: "Audit & Activity Timeline",
    category: "Navigation",
    icon: Activity,
    route: "/workspace/activity",
    subtitle: "Event history and verification log",
  },
  {
    id: "nav-rules",
    title: "Commercial Rules & Guardrails",
    category: "Navigation",
    icon: ShieldCheck,
    route: "/workspace/rules",
    subtitle: "Enforcement policies & discount thresholds",
  },
  {
    id: "nav-counterparties",
    title: "Buyers & Suppliers Directory",
    category: "Navigation",
    icon: Building2,
    route: "/workspace/counterparties",
    subtitle: "Commercial counterparties directory",
  },
  {
    id: "nav-settings",
    title: "Workspace Settings & Guardrails",
    category: "Navigation",
    icon: Settings,
    route: "/workspace/settings",
    subtitle: "Commercial thresholds & PayPal configurations",
  },
  // Specific Agreements
  {
    id: "agr-1042",
    title: "AGR-1042 — Meridian Retail",
    category: "Agreements",
    icon: FileCheck2,
    route: "/workspace/agreements/AGR-1042",
    badge: "Needs review",
    subtitle: "PO-8821 • $4,500 • 2 Term Conflicts",
  },
  {
    id: "agr-1041",
    title: "AGR-1041 — Apex Distribution",
    category: "Agreements",
    icon: FileCheck2,
    route: "/workspace/counteroffers",
    badge: "Counteroffer",
    subtitle: "PO-8819 • $8,250 • Payment Term Adjustment",
  },
  {
    id: "agr-1039",
    title: "AGR-1039 — Northline Traders",
    category: "Agreements",
    icon: FileCheck2,
    route: "/workspace/invoices",
    badge: "Ready to invoice",
    subtitle: "PO-8815 • $2,400 • Terms Approved",
  },
  // Specific Orders
  {
    id: "po-8821",
    title: "PO-8821 — Meridian Retail ($4,500)",
    category: "Purchase Orders",
    icon: FileText,
    route: "/workspace/agreements/AGR-1042",
    subtitle: "45 units Industrial Fluid Sensor",
  },
  {
    id: "po-8819",
    title: "PO-8819 — Apex Distribution ($8,250)",
    category: "Purchase Orders",
    icon: FileText,
    route: "/workspace/counteroffers",
    subtitle: "High precision actuator set",
  },
  // Invoices
  {
    id: "inv-089",
    title: "INV-2026-089 — Vertex Supplies ($6,800)",
    category: "Invoices",
    icon: DollarSign,
    route: "/workspace/invoices",
    badge: "Paid",
    subtitle: "Settled via PayPal Gateway",
  },
];

export const CommandSearch: React.FC<CommandSearchProps> = ({
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
      setQuery("");
    }
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return COMMAND_ITEMS;
    const lower = query.toLowerCase();
    return COMMAND_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        item.category.toLowerCase().includes(lower) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(lower))
    );
  }, [query]);

  const handleSelect = (route: string) => {
    router.push(route);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredItems.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredItems.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex].route);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#171A20]/45 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative w-full max-w-xl bg-surface border border-border rounded-xl shadow-modal overflow-hidden z-10 flex flex-col"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
              <Search className="w-4 h-4 text-content-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search agreements, purchase orders, invoices, or jump to section..."
                className="w-full bg-transparent text-sm text-content-primary placeholder:text-content-muted outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-content-muted hover:text-content-primary p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono text-content-muted px-1.5 py-0.5 bg-app border border-border rounded">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="max-h-80 overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-content-muted">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item.route)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? "bg-[#F0F4FF] text-primary"
                          : "text-content-primary hover:bg-app"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? "bg-white border-primary/30 text-primary"
                              : "bg-app border-border text-content-secondary"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-content-primary truncate">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-app border border-border text-content-secondary">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] text-content-muted truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-content-muted uppercase">
                          {item.category}
                        </span>
                        <ArrowRight className="w-3 h-3 text-content-muted opacity-60" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border-subtle bg-app text-[11px] text-content-muted">
              <span>Use ↑ ↓ to navigate, Enter to select</span>
              <span className="font-mono">TERMBridge Core</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
