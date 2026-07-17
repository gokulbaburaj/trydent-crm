"use client";

import { format, parseISO } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/shadcn/calendar";
import { Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

/**
 * shadcn Calendar (react-day-picker) in our popover, with a `yyyy-MM-dd`
 * string value API and Today / Clear shortcuts.
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
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover
      align={align}
      className="w-auto p-0"
      trigger={
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm hover:bg-white/5 focus:outline-none focus:border-primary/60 focus:ring-[3px] focus:ring-primary/20"
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted-2")}>
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
              className="rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      }
    >
      {(close) => (
        <div>
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? new Date()}
            weekStartsOn={1}
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : null);
              close();
            }}
          />
          <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                onChange(format(new Date(), "yyyy-MM-dd"));
                close();
              }}
              className="rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null);
                close();
              }}
              className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
