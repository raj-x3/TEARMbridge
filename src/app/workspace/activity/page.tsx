"use client";

import React, { useState, useMemo } from "react";
import {
  History,
  FileCheck2,
  GitCompare,
  Receipt,
  CreditCard,
  Clock,
  User,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ACTIVITY_EVENTS } from "@/data/mockData";

type CategoryFilter = "all" | "agreements" | "negotiations" | "invoices" | "payments";

export default function ActivityPage() {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");

  const filteredEvents = useMemo(() => {
    return ACTIVITY_EVENTS.filter((event) => {
      const matchCat = filter === "all" || event.category === filter;
      const matchQuery =
        event.action.toLowerCase().includes(query.toLowerCase()) ||
        event.eventDescription.toLowerCase().includes(query.toLowerCase()) ||
        event.relatedAgreement.toLowerCase().includes(query.toLowerCase()) ||
        event.actor.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [filter, query]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "agreements":
        return FileCheck2;
      case "negotiations":
        return GitCompare;
      case "invoices":
        return Receipt;
      case "payments":
        return CreditCard;
      default:
        return History;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit & Commercial Activity"
        subtitle="Immutable transaction event timeline, contractual amendments, counteroffer issuances, and payment gateway receipts."
      />

      {/* Main card */}
      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        {/* Filter controls */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Category pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                { id: "all", label: "All Events" },
                { id: "agreements", label: "Agreements" },
                { id: "negotiations", label: "Negotiations" },
                { id: "invoices", label: "Invoices" },
                { id: "payments", label: "Payments" },
              ] as const
            ).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilter(cat.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filter === cat.id
                    ? "bg-primary text-white"
                    : "bg-app text-content-secondary hover:text-content-primary hover:bg-[#EFEFEA] border border-border"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative sm:w-64">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Clean Timeline List */}
        <div className="p-6">
          <div className="relative before:absolute before:left-5 before:top-3 before:bottom-3 before:w-[1px] before:bg-border space-y-6">
            {filteredEvents.map((event) => {
              const Icon = getCategoryIcon(event.category);
              return (
                <div key={event.id} className="relative pl-12 text-xs group">
                  {/* Timeline icon node */}
                  <div className="absolute left-2.5 top-0.5 -translate-x-1/2 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-primary group-hover:border-primary transition-colors">
                    <Icon className="w-3 h-3" />
                  </div>

                  <div className="bg-surface hover:bg-[#FAFAF8] border border-border rounded-lg p-4 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-content-primary text-xs">
                          {event.action}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary uppercase">
                          {event.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-content-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {event.timestamp}
                      </span>
                    </div>

                    <p className="text-content-secondary text-xs leading-relaxed mb-3">
                      {event.eventDescription}
                    </p>

                    <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-content-muted">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <span>Actor: <strong className="text-content-primary font-normal">{event.actor}</strong></span>
                      </div>
                      <div className="text-primary font-medium">
                        Reference: {event.relatedAgreement}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-t border-border-subtle bg-app flex items-center justify-between text-[11px] text-content-muted">
          <span>Displaying {filteredEvents.length} verification events</span>
          <span className="font-mono">Audit Chain Verified</span>
        </div>
      </div>
    </div>
  );
}
