"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { Button as ShadButton } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Thin adapter over shadcn/ui Button — maps our historical variant/size names. */
const VARIANT_MAP: Record<Variant, "default" | "secondary" | "ghost" | "destructive"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost",
  danger: "destructive",
};

const SIZE_MAP: Record<Size, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <ShadButton
        ref={ref}
        variant={VARIANT_MAP[variant]}
        size={SIZE_MAP[size]}
        className={cn("active:scale-[0.97]", className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
