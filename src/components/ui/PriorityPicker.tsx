"use client";

import { Flag } from "lucide-react";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import type { TaskPriority } from "@/lib/types";
import { TASK_PRIORITIES } from "@/lib/types";

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; className: string; fill: boolean }
> = {
  urgent: { label: "Urgent", className: "text-danger", fill: true },
  high: { label: "High", className: "text-warning", fill: true },
  normal: { label: "Normal", className: "text-blue-400", fill: false },
  low: { label: "Low", className: "text-muted-2", fill: false },
};

/** Small colored flag for rows and cards; hidden for "normal" unless forced. */
export function PriorityFlag({
  priority,
  showNormal = false,
  className,
}: {
  priority: TaskPriority;
  showNormal?: boolean;
  className?: string;
}) {
  if (priority === "normal" && !showNormal) return null;
  const meta = PRIORITY_META[priority];
  return (
    <span title={`${meta.label} priority`} className={cn("shrink-0", className)}>
      <Flag
        className={cn("h-3.5 w-3.5", meta.className)}
        fill={meta.fill ? "currentColor" : "none"}
      />
    </span>
  );
}

/** Click-to-change priority, Linear-style menu. */
export function PriorityPicker({
  value,
  onChange,
  align = "left",
}: {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void;
  align?: "left" | "right";
}) {
  const meta = PRIORITY_META[value];
  return (
    <Popover
      align={align}
      trigger={
        <button className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/10">
          <Flag
            className={cn("h-3 w-3", meta.className)}
            fill={meta.fill ? "currentColor" : "none"}
          />
          {meta.label}
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Priority</MenuLabel>
          {TASK_PRIORITIES.map((p) => (
            <MenuItem
              key={p}
              selected={p === value}
              icon={
                <Flag
                  className={cn("h-3.5 w-3.5", PRIORITY_META[p].className)}
                  fill={PRIORITY_META[p].fill ? "currentColor" : "none"}
                />
              }
              onClick={() => {
                if (p !== value) onChange(p);
                close();
              }}
            >
              {PRIORITY_META[p].label}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}
