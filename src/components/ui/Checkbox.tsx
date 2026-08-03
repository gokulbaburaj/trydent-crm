"use client";

import { useId } from "react";
import { Checkbox as ShadCheckbox } from "@/components/shadcn/checkbox";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Checkbox with our legacy props signature.
 *
 * This used to be a hand-drawn box over a hidden native input, and it drifted
 * off the design contract in every dimension that matters: `border-white/20`
 * instead of `border-input`, `bg-white/[0.03]` instead of `bg-input/30`, an
 * arbitrary `rounded-[5px]`, and a `ring-primary/40` focus ring that matched
 * nothing else in the app. `design.md` is explicit — registry components live
 * in `shadcn/` and `ui/` only adapts their prop names. Wrapping the registry
 * component means the focus ring, border and radius track `Input` for free.
 *
 * The API is kept (`checked` / `onChange` / `label`) so call sites don't move.
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
  // The box is a <button>, so a wrapping <label> wouldn't toggle it. An id and
  // htmlFor does, because <button> is a labelable element.
  const id = useId();

  return (
    <div
      className={cn(
        // inline-flex, not flex — the old root was a shrink-wrapped <label> and
        // several call sites sit in text flow where a block would stretch.
        "inline-flex gap-2",
        align === "start" ? "items-start" : "items-center",
        className
      )}
    >
      <ShadCheckbox
        id={id}
        checked={checked}
        disabled={disabled}
        // Radix reports "indeterminate" as a third state; we never set it, but
        // the union has to be narrowed rather than cast away.
        onCheckedChange={(next) => onChange(next === true)}
        className={cn("shrink-0", align === "start" && "mt-0.5")}
      />
      {label && (
        <label
          htmlFor={id}
          className={cn(
            "min-w-0",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
        >
          {label}
        </label>
      )}
    </div>
  );
}
