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
          className="flex h-9 w-full items-center gap-2 rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm hover:bg-white/5 focus:outline-none focus:border-accent/60 focus:ring-[3px] focus:ring-accent/20"
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
