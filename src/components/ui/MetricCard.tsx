import React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  indicatorColor?: string;
  className?: string;
  badge?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  className,
  badge,
}) => {
  return (
    <div
      className={cn(
        "group relative bg-surface border border-border rounded-lg p-5 transition-all duration-200 hover:border-border-strong hover:shadow-subtle",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">
          {label}
        </span>
        {badge && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-app text-content-muted border border-border-subtle">
            {badge}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-content-primary tracking-tight tabular-nums">
          {value}
        </span>
      </div>

      {subtext && (
        <p className="mt-2 text-xs text-content-muted leading-relaxed">
          {subtext}
        </p>
      )}
    </div>
  );
};
