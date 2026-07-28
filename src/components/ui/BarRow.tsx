import { cn } from "@/lib/utils";

/**
 * A labelled proportion bar — the fill sits *behind* the label rather than
 * beside it.
 *
 * Taken from the reference dashboard's ranked list. It's better than a
 * label-plus-separate-bar for one specific reason: at a glance you read the
 * ranking from the bar lengths, and only look at the numbers when you care.
 * Splitting the two makes your eye do the work of pairing them back up.
 *
 * Deliberately not a chart. It's a list row that happens to be shaded, so it
 * inherits row hover, truncation and click behaviour for free.
 */
export function BarRow({
  label,
  value,
  pct,
  leading,
  tone = "primary",
  className,
}: {
  label: string;
  /** Right-aligned figure. Pre-formatted — this component doesn't know money. */
  value: string;
  /** 0–100. Clamped, because a stale percentage shouldn't overflow the track. */
  pct: number;
  /** Optional avatar or icon, sized by the caller. */
  leading?: React.ReactNode;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  const fill = {
    primary: "bg-primary/25",
    success: "bg-success/25",
    warning: "bg-warning/25",
    danger: "bg-danger/25",
  }[tone];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {leading}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
        <div
          aria-hidden
          className={cn("absolute inset-y-0 left-0 transition-[width] duration-500 ease-out", fill)}
          style={{ width: `${width}%` }}
        />
        <span className="relative block truncate px-2 py-1.5 text-[12.5px] text-foreground">
          {label}
        </span>
      </div>
      <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}
