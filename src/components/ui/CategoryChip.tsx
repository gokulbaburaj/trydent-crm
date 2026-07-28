import { cn } from "@/lib/utils";

/**
 * A coloured dot plus a label, for values from an open-ended set — teams,
 * departments, job roles, sources.
 *
 * Why a hash rather than a palette you assign: these sets are user-created and
 * unbounded. You add a "Sound" team in Settings and it should get a colour
 * immediately, without anyone editing a map. Same string always lands on the
 * same hue, so the colour is stable across pages and across sessions.
 *
 * This is NOT for status. Status has meaning — green is good, red is bad — and
 * that's `Badge` with its explicit tone table. A hash would happily paint
 * "Rejected" green.
 */

const HUES = [
  "#6366f1", // indigo
  "#22c55e", // green
  "#f59e0b", // amber
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#a855f7", // violet
  "#ef4444", // red
  "#84cc16", // lime
];

/** FNV-ish string hash. Small, stable, and doesn't clump on similar prefixes
 *  the way `charCodeAt(0)` does — "Design" and "Delivery" get different hues. */
export function categoryColor(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return HUES[Math.abs(h) % HUES.length];
}

export function CategoryChip({
  value,
  className,
  dotOnly = false,
}: {
  value: string | null | undefined;
  className?: string;
  /** Just the dot — for tight cells where the label is already elsewhere. */
  dotOnly?: boolean;
}) {
  if (!value) {
    return <span className={cn("text-[12px] text-muted-2", className)}>—</span>;
  }
  const color = categoryColor(value);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ background: color }}
      />
      {!dotOnly && <span className="truncate text-[12.5px] text-foreground-secondary">{value}</span>}
    </span>
  );
}
