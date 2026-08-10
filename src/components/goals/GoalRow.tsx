"use client";

import { AlertTriangle, CircleCheck, CircleDashed, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pace, PaceStatus } from "@/lib/goalPace";

/**
 * One goal, one line.
 *
 * ── What the bar carries ────────────────────────────────────────────────────
 *
 * Fill is where you are. The tick is where you'd be if progress were even
 * across the goal's window. The distance between them is the status, which is
 * why there's no status dropdown any more — a goal can't read "13%" and "On
 * track" at the same time when the label is derived from the same two numbers
 * as the bar.
 *
 * The previous version put the bar on its own line below the numbers, spanning
 * the full card, with the source label right-aligned at its far end. That made
 * the bar look like a caption for whatever was nearest it. Here it sits
 * between the name and the figures and absorbs the horizontal slack, which is
 * the only element on the row that can.
 */

const STATUS_META: Record<
  PaceStatus,
  { icon: typeof AlertTriangle; tone: string; fill: string }
> = {
  achieved: { icon: CircleCheck, tone: "text-[var(--success-fg)]", fill: "bg-success" },
  on_track: { icon: CircleCheck, tone: "text-[var(--success-fg)]", fill: "bg-success" },
  at_risk: { icon: AlertTriangle, tone: "text-[var(--warning-fg)]", fill: "bg-warning" },
  off_track: { icon: AlertTriangle, tone: "text-[var(--danger-fg)]", fill: "bg-danger" },
  missed: { icon: AlertTriangle, tone: "text-[var(--danger-fg)]", fill: "bg-danger" },
  not_started: { icon: CircleDashed, tone: "text-muted-2", fill: "bg-primary" },
  undated: { icon: CircleDashed, tone: "text-muted-2", fill: "bg-primary" },
};

export function GoalRow({
  title,
  pct,
  pace,
  detail,
  action,
  stalled,
  onDelete,
  children,
}: {
  title: string;
  pct: number;
  pace: Pace;
  /** Right-hand context: "₹175,000 left · 7 weeks". */
  detail: string;
  /** Left-hand call to action: "₹25,000/week needed". Coloured by status. */
  action: string | null;
  stalled: boolean;
  onDelete: () => void;
  /** The editable value control, rendered inline at the end of the row. */
  children?: React.ReactNode;
}) {
  const meta = STATUS_META[pace.status];
  const Icon = meta.icon;
  const expectedPct = pace.expected === null ? null : pace.expected * 100;

  return (
    <div className="group px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", meta.tone)} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium" title={title}>
          {title}
        </span>
        {stalled && (
          <span
            className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--warning-fg)]"
            title="No update in over three weeks"
          >
            <Clock className="h-3 w-3" aria-hidden="true" /> stale
          </span>
        )}
        {children}
        <span className="w-10 shrink-0 text-right text-[13px] tabular-nums">{pct}%</span>
        <button
          type="button"
          aria-label={`Delete ${title}`}
          onClick={onDelete}
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[var(--danger-fg)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative ml-7 mt-2 h-2 rounded-full bg-active">
        <div
          className={cn(
            "h-2 rounded-full transition-[width] duration-300 ease-[var(--ease-out)]",
            meta.fill
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
        {expectedPct !== null && expectedPct > 0 && expectedPct < 100 && (
          /*
            The tick is the point of the whole row, so it's drawn in the
            foreground colour rather than a status hue — it means "today",
            not "good" or "bad", and tinting it would imply a judgement that
            belongs to the gap, not the marker.
          */
          <div
            className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
            style={{ left: `${expectedPct}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <div className="ml-7 mt-1.5 flex items-baseline justify-between gap-3">
        <span className={cn("truncate text-[12px]", action ? meta.tone : "text-muted-2")}>
          {action ?? ""}
        </span>
        <span className="shrink-0 text-[12px] text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}
