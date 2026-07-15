"use client";

import { ChevronDown } from "lucide-react";
import { Popover, MenuItem } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

export interface DropdownOption {
  value: string;
  label: string;
}

/**
 * Brand-styled replacement for native <select> — Input-look trigger,
 * Linear-style menu. Options open in our Popover instead of the OS picker.
 */
export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select...",
  align = "left",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <Popover
      align={align}
      fullWidth
      className="max-h-64 w-[260px] overflow-y-auto"
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-white/5 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
        >
          <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted-2")}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
      }
    >
      {(close) => (
        <>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}
