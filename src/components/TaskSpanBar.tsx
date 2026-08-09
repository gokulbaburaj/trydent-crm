"use client";

import { formatDate } from "@/lib/format";
import { taskSpan } from "@/lib/projectPhase";
import { cn } from "@/lib/utils";
import type { ProjectTask } from "@/lib/types";

/**
 * A task's date range, drawn.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `project_tasks.start_date` was added by migration 2026-08-08b, wired into
 * the task drawer with a min/max-constrained date picker, and then never
 * rendered anywhere. You could set a task to run the 3rd to the 7th and the
 * app would show you "Aug 7" — identical to a task due on the 7th with no
 * start at all. The column existed; the information didn't.
 *
 * This is the smallest thing that makes it visible: a single-day task reads as
 * a date, a multi-day task reads as a range with its length. Not a Gantt bar —
 * this sits in a list row where there's no horizontal axis to be proportional
 * to, and a bar with nothing to measure against is decoration.
 *
 * The proportional version belongs on the project timeline, where days ARE the
 * axis. `spanPosition` in lib/projectPhase.ts exists for that and is tested;
 * this component doesn't use it yet.
 */
export function TaskSpanBar({
  task,
  className,
}: {
  task: Pick<ProjectTask, "start_date" | "due_date">;
  className?: string;
}) {
  const span = taskSpan(task);

  // Not on a calendar at all. Renders nothing rather than an em dash — the
  // row already has a name and a status, and a placeholder for an absent date
  // is noise in a list of eight.
  if (!span) return null;

  const multi = span.days > 1;

  if (!multi) {
    return (
      <span className={cn("text-[11px] tabular-nums text-muted-2", className)}>
        {formatDate(span.end)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "bg-[var(--surface)] text-[11px] tabular-nums text-foreground-secondary",
        className
      )}
      /* The full range on hover — the pill shows the shape, the title shows
         the dates, and neither has to be truncated to fit the other. */
      title={`${formatDate(span.start)} → ${formatDate(span.end)}`}
    >
      {/* Two dots joined by a rule: the smallest mark that reads as "a range"
          rather than "a date". Purely decorative, so it's hidden from
          assistive tech — the title and the text carry the meaning. */}
      <span aria-hidden className="flex items-center gap-[3px]">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-px w-2 bg-current opacity-50" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
      {span.days}d
    </span>
  );
}
