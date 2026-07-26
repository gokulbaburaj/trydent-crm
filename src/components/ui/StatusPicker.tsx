"use client";

import { Badge, statusTone } from "@/components/ui/Badge";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

const dotColor: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  blue: "bg-blue-400",
  gray: "bg-muted-foreground",
};

/**
 * Click-to-change status: the badge itself is the trigger,
 * opening a Linear-style menu of all statuses.
 */
export function StatusPicker<T extends string>({
  value,
  options,
  onChange,
  align = "left",
  label = "Change status",
  renderLabel,
  toneFor,
}: {
  value: T;
  options: readonly T[];
  onChange: (status: T) => void;
  align?: "left" | "right";
  label?: string;
  /** For enum values that aren't display-ready, e.g. "on_track" → "On track". */
  renderLabel?: (value: T) => string;
  /** For values statusTone can't read, e.g. goal statuses. */
  toneFor?: (value: T) => "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const text = (v: T) => (renderLabel ? renderLabel(v) : v);
  const tone = (v: T) => (toneFor ? toneFor(v) : statusTone(v));

  return (
    <Popover
      align={align}
      trigger={
        <Badge
          tone={tone(value)}
          dot
          className="cursor-pointer transition-[filter] hover:brightness-125"
        >
          {text(value)}
        </Badge>
      }
    >
      {(close) => (
        <>
          <MenuLabel>{label}</MenuLabel>
          {options.map((s) => (
            <MenuItem
              key={s}
              selected={s === value}
              icon={
                <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[tone(s)])} />
              }
              onClick={() => {
                if (s !== value) onChange(s);
                close();
              }}
            >
              {text(s)}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}
