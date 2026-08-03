"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime, minutesOf } from "@/lib/taskTime";

/**
 * Optional clock time, shaped to match `DatePicker`.
 *
 * Deliberately NOT built on the shared Radix popover.
 *
 * That popover portals its content to <body>. This control lives inside the
 * task drawer, which is a modal dialog, and a modal dialog installs a scroll
 * lock (react-remove-scroll) over everything outside its own content. The
 * portalled list therefore sat outside the allowed region: dragging the
 * scrollbar worked, because that's a pointer gesture, but the wheel was
 * swallowed before it arrived. Rendering in normal flow sidesteps the whole
 * problem and costs about twenty lines.
 *
 * A grid of fixed slots rather than `<input type="time">`, which renders
 * differently in every browser and ignores the app's tokens. Real scheduling
 * lands on the quarter hour.
 *
 * Clearing is first-class — the X sets null, which means all-day, a state
 * people move back to as often as they move away from it.
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
}: {
  value: string | null | undefined;
  onChange: (time: string | null) => void;
  placeholder?: string;
  minTime?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const label = formatTime(value);
  const floor = minutesOf(minTime);

  // Close on an outside press or Escape. pointerdown rather than click so the
  // list closes before a click lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Open scrolled to the current selection instead of at 6am, which is a long
  // way from any time anyone actually picks.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector("[data-selected='true']")?.scrollIntoView({ block: "center" });
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-white/15 bg-transparent px-3 py-1 text-sm text-foreground shadow-sm transition-colors hover:bg-white/5 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/20"
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
              setOpen(false);
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-[9rem] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-xl shadow-black/60"
        >
          {SLOTS.map((slot) => {
            const mins = minutesOf(slot)!;
            const disabled = floor != null && mins <= floor;
            const selected = minutesOf(value) === mins;
            return (
              <button
                key={slot}
                type="button"
                disabled={disabled}
                data-selected={selected}
                onClick={() => {
                  onChange(`${slot}:00`);
                  setOpen(false);
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
    </div>
  );
}
