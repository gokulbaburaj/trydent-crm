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
}: {
  value: T;
  options: readonly T[];
  onChange: (status: T) => void;
  align?: "left" | "right";
  label?: string;
}) {
  return (
    <Popover
      align={align}
      trigger={
        <Badge
          tone={statusTone(value)}
          dot
          className="cursor-pointer transition-[filter] hover:brightness-125"
        >
          {value}
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
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", dotColor[statusTone(s)])}
                />
              }
              onClick={() => {
                if (s !== value) onChange(s);
                close();
              }}
            >
              {s}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}
