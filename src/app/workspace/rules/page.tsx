"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { COMMERCIAL_RULES } from "@/data/mockData";
import { useToast } from "@/components/ui/Toast";

interface CommercialRuleItem {
  id: string;
  name: string;
  parameter: string;
  enforcement: string;
  allowableDiscount: string;
  status: string;
  description: string;
}

export default function CommercialRulesPage() {
  const { success } = useToast();
  const [rules, setRules] = useState<CommercialRuleItem[]>(COMMERCIAL_RULES);
  const [selectedRule, setSelectedRule] = useState<CommercialRuleItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New rule form state
  const [newRuleName, setNewRuleName] = useState("");
  const [newParameter, setNewParameter] = useState("");
  const [newEnforcement, setNewEnforcement] = useState("Strict Contractual");
  const [newDiscount, setNewDiscount] = useState("5.00% max");
  const [newDesc, setNewDesc] = useState("");

  const handleOpenEdit = (rule: CommercialRuleItem) => {
    setSelectedRule({ ...rule });
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedRule) return;
    setRules((prev) =>
      prev.map((r) => (r.id === selectedRule.id ? selectedRule : r))
    );
    setEditModalOpen(false);
    success("Commercial Rule Updated", `Rule ${selectedRule.name} parameters saved.`);
  };

  const handleCreateRule = () => {
    if (!newRuleName.trim()) return;
    const newRule: CommercialRuleItem = {
      id: `rule-${rules.length + 1}`,
      name: newRuleName,
      parameter: newParameter || "Custom Commercial Threshold",
      enforcement: newEnforcement,
      allowableDiscount: newDiscount,
      status: "Active",
      description: newDesc || "Custom commercial threshold guardrail configured by Alex Morgan.",
    };
    setRules((prev) => [...prev, newRule]);
    setCreateModalOpen(false);
    setNewRuleName("");
    setNewParameter("");
    setNewDesc("");
    success("Commercial Rule Created", `Rule ${newRule.name} is now active.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commercial Rules & Guardrails"
        subtitle="Configured commercial policies for automated discount thresholds, settlement terms verification, and invoicing gates."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create commercial rule
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="p-5 bg-surface border border-border rounded-lg shadow-subtle flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold text-content-primary">
                  {rule.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {rule.status}
                </span>
              </div>

              <div className="p-3 bg-app rounded-md border border-border font-mono text-[11px] text-content-secondary space-y-1 mb-3">
                <div>
                  <span className="text-content-muted">Rule Parameter:</span>{" "}
                  <strong className="text-content-primary font-medium">{rule.parameter}</strong>
                </div>
                <div>
                  <span className="text-content-muted">Enforcement:</span>{" "}
                  <span className="text-primary">{rule.enforcement}</span>
                </div>
                <div>
                  <span className="text-content-muted">Allowable Variance:</span>{" "}
                  <span className="text-amber-700 font-medium">{rule.allowableDiscount}</span>
                </div>
              </div>

              <p className="text-xs text-content-secondary leading-relaxed">
                {rule.description}
              </p>
            </div>

            <div className="pt-3 mt-4 border-t border-border-subtle flex items-center justify-between text-[11px] text-content-muted">
              <span>Rule ID: {rule.id}</span>
              <button
                onClick={() => handleOpenEdit(rule)}
                className="text-primary hover:underline font-medium cursor-pointer"
              >
                Configure policy
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Rule Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={selectedRule ? `Configure Policy — ${selectedRule.name}` : "Configure Rule"}
        description="Update validation parameters and allowable contractual tolerances."
      >
        {selectedRule && (
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Rule Name
              </label>
              <input
                type="text"
                value={selectedRule.name}
                onChange={(e) =>
                  setSelectedRule({ ...selectedRule, name: e.target.value })
                }
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Parameter Condition
              </label>
              <input
                type="text"
                value={selectedRule.parameter}
                onChange={(e) =>
                  setSelectedRule({ ...selectedRule, parameter: e.target.value })
                }
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="font-semibold text-content-primary block">
                  Enforcement Mode
                </label>
                <select
                  value={selectedRule.enforcement}
                  onChange={(e) =>
                    setSelectedRule({ ...selectedRule, enforcement: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
                >
                  <option value="Strict Contractual">Strict Contractual</option>
                  <option value="Strict Financial">Strict Financial</option>
                  <option value="Conditional">Conditional</option>
                  <option value="Automated Gate">Automated Gate</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-content-primary block">
                  Allowable Variance
                </label>
                <input
                  type="text"
                  value={selectedRule.allowableDiscount}
                  onChange={(e) =>
                    setSelectedRule({ ...selectedRule, allowableDiscount: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Policy Description
              </label>
              <textarea
                value={selectedRule.description}
                onChange={(e) =>
                  setSelectedRule({ ...selectedRule, description: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
              />
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Rule Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Commercial Rule"
        description="Establish automated validation guardrails for contract interpretation and discount checks."
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Rule Name
            </label>
            <input
              type="text"
              placeholder="e.g. Tier-3 Margin Floor"
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Parameter Condition
            </label>
            <input
              type="text"
              placeholder="e.g. Order Value > $10,000"
              value={newParameter}
              onChange={(e) => setNewParameter(e.target.value)}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Enforcement
              </label>
              <select
                value={newEnforcement}
                onChange={(e) => setNewEnforcement(e.target.value)}
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
              >
                <option value="Strict Contractual">Strict Contractual</option>
                <option value="Strict Financial">Strict Financial</option>
                <option value="Conditional">Conditional</option>
                <option value="Automated Gate">Automated Gate</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-content-primary block">
                Allowable Tolerance
              </label>
              <input
                type="text"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold text-content-primary block">
              Description
            </label>
            <textarea
              placeholder="Describe commercial purpose and triggered action..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-app border border-border rounded-md text-content-primary text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateRule}
              disabled={!newRuleName.trim()}
            >
              Establish Rule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
