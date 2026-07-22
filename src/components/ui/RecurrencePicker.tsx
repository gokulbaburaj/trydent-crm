"use client";

import { Repeat } from "lucide-react";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { RECURRENCE_META } from "@/lib/recurrence";
import type { Recurrence } from "@/lib/types";
import { RECURRENCES } from "@/lib/types";

/** Click-to-change recurrence, styled like PriorityPicker. */
export function RecurrencePicker({
  value,
  onChange,
  align = "left",
}: {
  value: Recurrence;
  onChange: (r: Recurrence) => void;
  align?: "left" | "right";
}) {
  const meta = RECURRENCE_META[value];
  const repeats = value !== "none";
  return (
    <Popover
      align={align}
      fullWidth
      trigger={
        <button className="flex w-full items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-white/5">
          <Repeat
            className={cn("h-3.5 w-3.5 shrink-0", repeats ? "text-primary" : "text-muted-foreground")}
          />
          <span className={cn("min-w-0 truncate", !repeats && "text-muted-2")}>{meta.label}</span>
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Repeat</MenuLabel>
          {RECURRENCES.map((r) => (
            <MenuItem
              key={r}
              selected={r === value}
              onClick={() => {
                if (r !== value) onChange(r);
                close();
              }}
            >
              {RECURRENCE_META[r].label}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

/** Small ↻ badge for rows, cards, and calendar chips. */
export function RecurrenceIndicator({
  recurrence,
  className,
}: {
  recurrence: Recurrence;
  className?: string;
}) {
  if (recurrence === "none") return null;
  return (
    <span title={`Repeats — ${RECURRENCE_META[recurrence].label.toLowerCase()}`} className={cn("shrink-0", className)}>
      <Repeat className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}
