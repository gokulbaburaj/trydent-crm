import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full rounded bg-surface-raised border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
