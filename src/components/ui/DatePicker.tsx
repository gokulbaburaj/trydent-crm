"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Linear-style date picker: input-look trigger opening a dark month-grid popover.
 * Value is a `yyyy-MM-dd` string (or null).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  align = "left",
}: {
  value: string | null | undefined;
  onChange: (date: string | null) => void;
  placeholder?: string;
  align?: "left" | "right";
}) {
  const selected = value ? parseISO(value) : null;
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  return (
    <Popover
      align={align}
      className="w-[248px] p-2"
      trigger={
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-white/5 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className={cn("flex-1 text-left", !selected && "text-muted-2")}>
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-muted hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div>
          <div className="mb-1 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[13px] font-medium">
              {format(month, "MMMM")}{" "}
              <span className="font-normal text-muted">{format(month, "yyyy")}</span>
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1 text-[10px] font-medium text-muted-2">
                {d}
              </span>
            ))}
            {grid.map((day) => {
              const isSelected = !!selected && isSameDay(day, selected);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, "yyyy-MM-dd"));
                    close();
                  }}
                  className={cn(
                    "mx-auto flex h-7 w-7 items-center justify-center rounded text-xs transition-colors",
                    isSelected
                      ? "bg-accent font-semibold text-accent-foreground"
                      : isToday(day)
                        ? "font-semibold text-accent hover:bg-white/5"
                        : isSameMonth(day, month)
                          ? "text-foreground hover:bg-white/5"
                          : "text-muted-2 hover:bg-white/5"
                  )}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-1 pt-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(format(new Date(), "yyyy-MM-dd"));
                close();
              }}
              className="rounded px-1.5 py-1 text-xs font-medium text-muted hover:bg-white/5 hover:text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
              className="rounded px-1.5 py-1 text-xs text-muted hover:bg-white/5 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
