"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Brand checkbox.
 *
 * `accent-color` on a native input gets you the OS control — rounded-square on
 * macOS, a different shape on Windows, and a blue that ignores the user's
 * accent. This keeps the real input for keyboard and screen-reader behaviour
 * but hides it and draws our own box on top.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  align = "center",
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  /** "start" when the label runs to a second line (a title plus help text) —
   *  centring the box against a two-line label leaves it floating. */
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group/cb inline-flex gap-2",
        align === "start" ? "items-start" : "items-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className
      )}
    >
      <span
        className={cn(
          "relative flex h-4 w-4 shrink-0 items-center justify-center",
          align === "start" && "mt-0.5"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-[inherit] opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-[5px] border transition-all duration-150",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/20 bg-white/[0.03] group-hover/cb:border-white/35"
          )}
        >
          <Check
            className={cn(
              "h-3 w-3 transition-transform duration-150",
              checked ? "scale-100" : "scale-0"
            )}
            strokeWidth={3}
          />
        </span>
      </span>
      {label}
    </label>
  );
}
