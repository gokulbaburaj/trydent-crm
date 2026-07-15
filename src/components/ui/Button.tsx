"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground shadow-sm hover:brightness-110",
  secondary:
    "bg-white/10 text-foreground shadow-sm hover:bg-white/15",
  ghost: "bg-transparent text-muted hover:bg-white/5 hover:text-foreground",
  danger: "bg-danger/90 text-white shadow-sm hover:bg-danger",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13px] px-3 gap-1.5",
  md: "h-9 text-sm px-4 gap-2",
  lg: "h-10 text-sm px-5 gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
