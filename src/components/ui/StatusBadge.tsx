import React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "needs_review"
  | "counteroffer_sent"
  | "ready_to_invoice"
  | "completed"
  | "draft"
  | "awaiting_counterparty"
  | "paid"
  | "overdue"
  | "sent"
  | "matched"
  | "conflict"
  | "needs_confirmation"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "verified"
  | "pending"
  | "neutral";

interface StatusBadgeProps {
  status: BadgeVariant | string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

const badgeStyles: Record<
  string,
  { bg: string; text: string; border: string; dot: string; defaultLabel: string }
> = {
  needs_review: {
    bg: "bg-[#FFF7ED]",
    text: "text-[#C2410C]",
    border: "border-[#FFEDD5]",
    dot: "bg-[#EA580C]",
    defaultLabel: "Needs review",
  },
  conflict: {
    bg: "bg-[#FEF2F2]",
    text: "text-[#B91C1C]",
    border: "border-[#FEE2E2]",
    dot: "bg-[#DC2626]",
    defaultLabel: "Conflict",
  },
  counteroffer_sent: {
    bg: "bg-[#EFF6FF]",
    text: "text-[#2563EB]",
    border: "border-[#DBEAFE]",
    dot: "bg-[#3B82F6]",
    defaultLabel: "Counteroffer sent",
  },
  awaiting_counterparty: {
    bg: "bg-[#F8FAFC]",
    text: "text-[#475569]",
    border: "border-[#E2E8F0]",
    dot: "bg-[#94A3B8]",
    defaultLabel: "Awaiting counterparty",
  },
  ready_to_invoice: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#15803D]",
    border: "border-[#DCFCE7]",
    dot: "bg-[#22C55E]",
    defaultLabel: "Ready to invoice",
  },
  completed: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#166534]",
    border: "border-[#BBF7D0]",
    dot: "bg-[#15803D]",
    defaultLabel: "Completed",
  },
  paid: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#15803D]",
    border: "border-[#DCFCE7]",
    dot: "bg-[#22C55E]",
    defaultLabel: "Paid",
  },
  draft: {
    bg: "bg-[#F4F4F2]",
    text: "text-[#525866]",
    border: "border-[#E5E6E3]",
    dot: "bg-[#969BA4]",
    defaultLabel: "Draft",
  },
  sent: {
    bg: "bg-[#EFF6FF]",
    text: "text-[#2563EB]",
    border: "border-[#DBEAFE]",
    dot: "bg-[#3B82F6]",
    defaultLabel: "Sent",
  },
  overdue: {
    bg: "bg-[#FEF2F2]",
    text: "text-[#B91C1C]",
    border: "border-[#FEE2E2]",
    dot: "bg-[#DC2626]",
    defaultLabel: "Overdue",
  },
  matched: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#15803D]",
    border: "border-[#DCFCE7]",
    dot: "bg-[#22C55E]",
    defaultLabel: "Matched",
  },
  needs_confirmation: {
    bg: "bg-[#FFFBEB]",
    text: "text-[#B45309]",
    border: "border-[#FEF3C7]",
    dot: "bg-[#F59E0B]",
    defaultLabel: "Needs confirmation",
  },
  critical: {
    bg: "bg-[#FEF2F2]",
    text: "text-[#991B1B]",
    border: "border-[#F87171]",
    dot: "bg-[#DC2626]",
    defaultLabel: "Critical",
  },
  high: {
    bg: "bg-[#FFF7ED]",
    text: "text-[#C2410C]",
    border: "border-[#FDBA74]",
    dot: "bg-[#EA580C]",
    defaultLabel: "High",
  },
  medium: {
    bg: "bg-[#FFFBEB]",
    text: "text-[#B45309]",
    border: "border-[#FCD34D]",
    dot: "bg-[#F59E0B]",
    defaultLabel: "Medium",
  },
  low: {
    bg: "bg-[#F4F4F2]",
    text: "text-[#525866]",
    border: "border-[#E5E6E3]",
    dot: "bg-[#9CA3AF]",
    defaultLabel: "Low",
  },
  verified: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#15803D]",
    border: "border-[#DCFCE7]",
    dot: "bg-[#22C55E]",
    defaultLabel: "Verified",
  },
  pending: {
    bg: "bg-[#FFFBEB]",
    text: "text-[#B45309]",
    border: "border-[#FEF3C7]",
    dot: "bg-[#F59E0B]",
    defaultLabel: "Pending",
  },
  neutral: {
    bg: "bg-[#F4F4F2]",
    text: "text-[#525866]",
    border: "border-[#E5E6E3]",
    dot: "bg-[#969BA4]",
    defaultLabel: "Neutral",
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className,
  size = "sm",
  showDot = true,
}) => {
  const normalizedKey = status.toLowerCase().replace(/[\s-]/g, "_");
  const style = badgeStyles[normalizedKey] || badgeStyles.neutral;
  const displayLabel = label || style.defaultLabel;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium border rounded-md transition-colors",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        style.bg,
        style.text,
        style.border,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            "rounded-full shrink-0",
            size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2",
            style.dot
          )}
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
};
