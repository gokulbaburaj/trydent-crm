import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full rounded bg-surface-raised border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded bg-surface-raised border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted mb-1.5">
      {children}
    </label>
  );
}
