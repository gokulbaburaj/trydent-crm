import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-2 focus:outline-none focus:border-accent/60 focus:ring-[3px] focus:ring-accent/20",
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
      "w-full rounded-md border border-white/15 bg-transparent px-3 py-2 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-2 focus:outline-none focus:border-accent/60 focus:ring-[3px] focus:ring-accent/20",
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
