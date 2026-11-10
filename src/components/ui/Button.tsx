import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "sm",
      icon,
      iconPosition = "left",
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-md select-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100";

    const sizeStyles = {
      xs: "text-xs px-2.5 py-1 gap-1.5 h-7",
      sm: "text-xs px-3 py-1.5 gap-2 h-8",
      md: "text-sm px-4 py-2 gap-2 h-9",
      lg: "text-sm px-5 py-2.5 gap-2.5 h-10",
    };

    const variantStyles = {
      primary:
        "bg-primary text-white hover:bg-primary-hover shadow-subtle border border-primary-border/20",
      secondary:
        "bg-surface text-content-primary hover:bg-[#F4F4F2] border border-border hover:border-border-strong text-content-primary",
      outline:
        "bg-transparent text-content-primary hover:bg-[#F4F4F2] border border-border hover:border-border-strong",
      ghost:
        "bg-transparent text-content-secondary hover:text-content-primary hover:bg-[#F4F4F2] border border-transparent",
      danger:
        "bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2] border border-[#FCA5A5]/60",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          baseStyles,
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
        ) : (
          icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>
        )}
        {children}
        {!isLoading && icon && iconPosition === "right" && (
          <span className="shrink-0">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
