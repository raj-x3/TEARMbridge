"use client";

import React, { useState } from "react";
import { Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { COUNTERPARTIES } from "@/data/mockData";
import { useToast } from "@/components/ui/Toast";

interface CounterpartyItem {
  id: string;
  name: string;
  type: string;
  contactPerson: string;
  email: string;
  activeAgreements: number;
  totalVolume: string;
  creditRating: string;
  paymentPerformance: string;
}

export default function CounterpartiesPage() {
  const { success } = useToast();
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>(COUNTERPARTIES);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  // New counterparty form state
  const [name, setName] = useState("");
  const [type, setType] = useState("Buyer");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [creditRating, setCreditRating] = useState("Tier A");

  const filtered = counterparties.filter(
    (cp) =>
      cp.name.toLowerCase().includes(query.toLowerCase()) ||
      cp.contactPerson.toLowerCase().includes(query.toLowerCase()) ||
      cp.email.toLowerCase().includes(query.toLowerCase())
  );

  const handleAddCounterparty = () => {
    if (!name.trim()) return;
    const newEntity: CounterpartyItem = {
      id: `cp-${counterparties.length + 1}`,
      name,
      type,
      contactPerson: contactPerson || "Procurement Desk",
      email: email || `orders@${name.toLowerCase().replace(/\s+/g, "")}.com`,
      activeAgreements: 1,
      totalVolume: "$0",
      creditRating,
      paymentPerformance: "Pending history",
    };

    setCounterparties((prev) => [newEntity, ...prev]);
    setModalOpen(false);
    setName("");
    setContactPerson("");
    setEmail("");
    success("Counterparty Onboarded", `${newEntity.name} indexed into merchant counterparty directory.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buyers & Suppliers Directory"
        subtitle="Manage commercial counterparty profiles, credit rating tiers, active agreement count, and settlement history."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setModalOpen(true)}
          >
            Add counterparty
          </Button>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-subtle overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 text-content-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search counterparty or contact..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-app border border-border rounded-md text-content-primary placeholder:text-content-muted outline-none focus:border-primary"
            />
          </div>
          <span className="text-xs text-content-muted font-mono">
            {filtered.length} entities indexed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-[#FAFAF8] text-content-muted uppercase tracking-wider text-[11px] font-medium">
                <th className="py-3 px-4">Entity Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Primary Contact</th>
                <th className="py-3 px-4">Active Agreements</th>
                <th className="py-3 px-4">Cumulative Volume</th>
                <th className="py-3 px-4">Credit Tier</th>
                <th className="py-3 px-4">Avg Settlement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((cp) => (
                <tr key={cp.id} className="hover:bg-[#FAFAF8] transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-content-primary">
                    {cp.name}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app border border-border text-content-secondary uppercase">
                      {cp.type}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-content-secondary">
                    <div>{cp.contactPerson}</div>
                    <div className="text-[10px] text-content-muted font-mono">{cp.email}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-medium text-primary">
                    {cp.activeAgreements} active
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-content-primary">
                    {cp.totalVolume}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {cp.creditRating}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-content-secondary">
                    {cp.paymentPerformance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Counterparty Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Commercial Counterparty"
        description="Index an approved buyer or supplier entity into the TERMBridge directory."
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Organization Name
            </label>
            <input
              type="text"
              placeholder="e.g. Apex Global Supply"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Counterparty Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
              >
                <option value="Buyer">Buyer</option>
                <option value="Supplier">Supplier</option>
                <option value="Distributor">Distributor</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Credit Tier Rating
              </label>
              <select
                value={creditRating}
                onChange={(e) => setCreditRating(e.target.value)}
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
              >
                <option value="Tier A+">Tier A+ (Prime)</option>
                <option value="Tier A">Tier A</option>
                <option value="Tier B+">Tier B+</option>
                <option value="Tier B">Tier B</option>
                <option value="Unrated">Unrated</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Contact Officer Name
            </label>
            <input
              type="text"
              placeholder="e.g. Jordan Miller"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Commercial Billing Email
            </label>
            <input
              type="email"
              placeholder="e.g. billing@apexsupply.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAddCounterparty}
              disabled={!name.trim()}
            >
              Add to Directory
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
