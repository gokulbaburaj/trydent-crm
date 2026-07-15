import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
