import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-12 border border-dashed border-border rounded-lg bg-surface/50",
        className
      )}
    >
      <div className="w-10 h-10 rounded-full bg-app border border-border flex items-center justify-center text-content-secondary mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h4 className="text-sm font-semibold text-content-primary mb-1">
        {title}
      </h4>
      <p className="text-xs text-content-muted max-w-sm mb-4">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
