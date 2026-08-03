"use client";

import { Clock, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { formatTime, minutesOf } from "@/lib/taskTime";

/**
 * Optional clock time, shaped to match `DatePicker` so a date and a time sit
 * side by side without looking like two different apps.
 *
 * A grid of fixed slots rather than a free-text field or a native
 * `<input type="time">`. Two reasons: the native control renders differently
 * in every browser and ignores the app's tokens entirely, and real scheduling
 * lands on the half hour. Anyone who genuinely needs 14:07 can have that
 * conversation when it comes up.
 *
 * Clearing is first-class — the X sets null, which means all-day, which is a
 * state people move back to as often as they move away from it.
 */

/** 15-minute steps from 06:00 to 22:00. Outside that, nobody's scheduling. */
const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 15) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

export function TimePicker({
  value,
  onChange,
  placeholder = "All day",
  /** Slots at or before this are disabled — used for an end time. */
  minTime,
  align = "left",
}: {
  value: string | null | undefined;
  onChange: (time: string | null) => void;
  placeholder?: string;
  minTime?: string | null;
  align?: "left" | "right";
}) {
  const label = formatTime(value);
  const floor = minutesOf(minTime);

  return (
    <Popover
      align={align}
      className="w-auto p-0"
      trigger={
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm hover:bg-white/5 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/20"
        >
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate text-left", !label && "text-muted-2")}>
            {label || placeholder}
          </span>
          {label && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear time"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div className="max-h-64 w-40 overflow-y-auto p-1">
          {SLOTS.map((slot) => {
            const mins = minutesOf(slot)!;
            const disabled = floor != null && mins <= floor;
            const selected = minutesOf(value) === mins;
            return (
              <button
                key={slot}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(`${slot}:00`);
                  close();
                }}
                className={cn(
                  "block w-full rounded px-2 py-1 text-left text-[13px] tabular-nums transition-colors",
                  selected
                    ? "bg-primary/15 font-medium text-foreground"
                    : "text-foreground-secondary hover:bg-white/5 hover:text-foreground",
                  disabled && "pointer-events-none opacity-30"
                )}
              >
                {formatTime(slot)}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
