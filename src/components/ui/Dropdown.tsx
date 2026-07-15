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
