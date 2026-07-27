"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
}

/** Radix Select values can't be empty strings — map "" through a sentinel. */
const EMPTY = "__none__";

/**
 * Undo Radix's scroll lock a frame after the Select closes.
 *
 * Radix Select is always modal — @radix-ui/react-select 2.3.x has no `modal`
 * prop — so while it's open it sets `pointer-events: none` on <body>. It does
 * clear that on close, but not before the browser dispatches the very click
 * that caused the close. That click lands on an inert body and goes nowhere.
 *
 * Symptom: after touching any dropdown, the next click anywhere does nothing
 * and you have to click twice. On the Accounts page that reads as "the
 * collapse opens but won't close" — the closing click was being eaten.
 *
 * Guarded on there being no open dialog left, because our Drawer sets the same
 * property deliberately: clearing it under an open modal would make the
 * background clickable through the overlay.
 */
function releaseBodyPointerEvents() {
  requestAnimationFrame(() => {
    const modalStillOpen = document.querySelector('[role="dialog"][data-state="open"]');
    if (!modalStillOpen) document.body.style.pointerEvents = "";
  });
}

/**
 * shadcn/ui Select (Radix) with our options-array API.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select...",
  align,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  void align; // alignment handled by Radix collision detection
  const hasSelection = options.some((o) => o.value === value);

  return (
    <Select
      value={hasSelection ? (value === "" ? EMPTY : value) : undefined}
      onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      onOpenChange={(isOpen) => {
        if (isOpen) return;
        releaseBodyPointerEvents();
      }}
    >
      <SelectTrigger className={cn("w-full")}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || EMPTY} value={o.value === "" ? EMPTY : o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
