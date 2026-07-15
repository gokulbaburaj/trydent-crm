import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import { Input as ShadInput } from "@/components/shadcn/input";
import { Textarea as ShadTextarea } from "@/components/shadcn/textarea";
import { Label as ShadLabel } from "@/components/shadcn/label";
import { cn } from "@/lib/utils";

/** shadcn/ui Input with our legacy props signature. */
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <ShadInput ref={ref} className={className} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <ShadTextarea ref={ref} className={className} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <ShadLabel className={cn("mb-1.5 block text-xs font-medium text-muted-foreground")}>
      {children}
    </ShadLabel>
  );
}
