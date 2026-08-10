"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RecordShell — the structural change.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── What this replaces, and why ─────────────────────────────────────────────
 *
 * Until now every record surface in this app worked the same way: navigate to
 * a page, read a table, click a row, a Drawer slides over the table. That
 * pattern has three problems that no amount of restyling fixes.
 *
 *   1. The drawer covers the list it came from. You cannot compare two records
 *      or keep your place in the queue, so working through fifteen clients
 *      means fifteen open-read-close cycles.
 *   2. The drawer is not addressable. Nothing about the URL says which record
 *      is open, so it can't be linked, bookmarked, or restored on refresh, and
 *      the browser back button dismisses it in a way that also loses the list
 *      scroll position.
 *   3. It caps how much a record can show. A drawer is ~480px, so detail gets
 *      rationed into a single scrolling column — which is why the client
 *      record currently shows a stack of label/value pairs instead of the
 *      panel grid the design calls for.
 *
 * List-detail fixes all three at once: the queue stays visible on the left,
 * selection lives in the URL, and the pane is as wide as the window allows.
 *
 * ── Responsive behaviour ────────────────────────────────────────────────────
 *
 * Two columns from `lg`. Below that there is not enough width for a 360px
 * queue AND a readable record, so it collapses to one column and the detail
 * PUSHES over the list rather than sliding as an overlay. Push, not overlay,
 * because on a phone the two are alternative full screens and an overlay
 * implies the list is still there behind it — which is exactly the confusion
 * the drawer created on desktop.
 *
 * ── What this deliberately does NOT own ─────────────────────────────────────
 *
 * Data fetching, sorting, grouping, and what a record looks like. It owns the
 * two boxes and which one you can see. Everything else belongs to the page, so
 * that converting a surface is a layout change rather than a rewrite.
 */

/** Query param carrying the selected record. Shared so pages can't drift. */
export const RECORD_PARAM = "r";

/**
 * URL-backed selection.
 *
 * `router.replace`, not `push`. Clicking through eight records in a queue
 * should leave ONE history entry, not eight — otherwise the back button walks
 * you backwards through a reading session instead of returning you to
 * wherever you came from. Opening a record is closer to scrolling than to
 * navigating.
 *
 * The exception is closing on mobile, where the detail is a full screen and
 * back is the only gesture people will reach for. That case is handled by
 * `close` being wired to the back arrow explicitly rather than by history.
 */
export function useRecordSelection() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedId = params.get(RECORD_PARAM);

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set(RECORD_PARAM, id);
      else next.delete(RECORD_PARAM);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  return { selectedId, select, close: useCallback(() => select(null), [select]) };
}

export function RecordShell({
  list,
  detail,
  empty,
  hasSelection,
  recordKey,
  onBack,
  listWidth = "clamp(300px, 26vw, 380px)",
  className,
}: {
  /** The queue column. Always mounted. */
  list: React.ReactNode;
  /** The record pane. Only rendered when something is selected. */
  detail?: React.ReactNode;
  /** Shown in the pane's place when nothing is selected, on wide screens only. */
  empty?: React.ReactNode;
  hasSelection: boolean;
  /**
   * Identity of the record on show. Remounts the pane when it changes.
   *
   * Does two jobs at once, which is why it's one prop rather than two:
   *
   *  1. The pane's content used to swap with nothing bridging the old and new
   *     record. A remount lets `.animate-pop` (130ms, the existing token) carry
   *     it. Deliberately the shortest animation we have — reading through a
   *     queue is a tens-per-day action, and anything slower reads as lag.
   *  2. It makes <Money> behave. NumberFlow animates when a value changes
   *     within a mount and paints instantly on a fresh one — so a currency
   *     switch rolls the digits while clicking to another record doesn't.
   *     Without the key, every figure would spin on every row click.
   */
  recordKey?: string | null;
  onBack: () => void;
  listWidth?: string;
  className?: string;
}) {
  const wide = useMediaQuery("(min-width: 1024px)");

  // On a narrow screen exactly one of the two is on screen. Deriving this
  // rather than storing it keeps the URL as the single source of truth — a
  // stored `showDetail` boolean and a `?r=` param WILL disagree the first time
  // someone pastes a link.
  const showList = wide || !hasSelection;

  const listStyle = useMemo(
    () => (wide ? { width: listWidth, flex: "0 0 auto" as const } : undefined),
    [wide, listWidth]
  );

  return (
    <div className={cn("flex h-full min-h-0 w-full gap-3", className)}>
      {showList && (
        <div
          style={listStyle}
          className={cn(
            "flex min-h-0 min-w-0 flex-col",
            !wide && "flex-1",
            // The queue is a plain surface. Only the record pane gets the
            // wash — that contrast is what makes the pane read as the focused
            // thing rather than as decoration, and washing both would flatten
            // the hierarchy the whole layout depends on.
            "overflow-hidden rounded-[var(--radius)] border border-border bg-card"
          )}
        >
          {list}
        </div>
      )}

      {hasSelection && (
        <div
          key={recordKey ?? undefined}
          className="animate-pop flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {/* Back is the only way out on a narrow screen, so it is rendered
              here rather than left to each page to remember. */}
          {!wide && (
            <button
              onClick={onBack}
              className="mb-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {detail}
        </div>
      )}

      {wide && !hasSelection && empty && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{empty}</div>
      )}
    </div>
  );
}

/* ─────────────────────────── Queue pieces ─────────────────────────── */

/**
 * Sticky header for the queue column: title, then actions.
 *
 * Separate from the page's own Topbar title because the queue has its own
 * identity in this layout — "My Work" in the reference is the name of the
 * COLUMN, not the page, and the page title bar above it says where in the app
 * you are. Collapsing the two makes the record pane look like a detached
 * floating panel with no parent.
 */
export function QueueHeader({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
      <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">
        {title}
        {count != null && (
          <span className="ml-2 text-[13px] font-normal tabular-nums text-muted-2">
            {count}
          </span>
        )}
      </h2>
      {children}
    </div>
  );
}

/**
 * The "Today" / "3 weeks ago" divider.
 *
 * A centred label on a rule rather than a left-aligned caption, matching the
 * reference. It reads as a break in a stream rather than as the heading of a
 * section, which is the correct implication: these groups are time buckets you
 * scroll past, not categories you navigate between.
 */
export function QueueDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="shrink-0 text-[12px] font-medium text-muted-2">{label}</span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  );
}

/**
 * One row in the queue.
 *
 * Selection is carried by the HEAT of the record, not by a generic accent
 * fill: the selected row in the reference is lime because that record scores
 * 90, and the pane it opens starts lime in the same corner. Pass `heat` to get
 * that; without it selection falls back to a neutral raised surface, which is
 * correct for records that have no score to show.
 */
export function QueueItem({
  selected,
  heatBackground,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  /** A `--heat-N` value, when the record has a score worth colouring by. */
  heatBackground?: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={selected ? "true" : undefined}
      style={selected && heatBackground ? { background: heatBackground } : undefined}
      className={cn(
        "w-full rounded-[calc(var(--radius)-0.35rem)] px-3 py-3 text-left transition-colors",
        selected
          ? heatBackground
            ? [
                "shadow-[var(--shadow-sm)]",
                /*
                  Step the muted tiers up on a heat background.

                  The queue's secondary text is tuned for the card surface it
                  normally sits on. A selected row repaints that surface with a
                  heat colour, and the contrast scanner caught the result at
                  3.73:1 against a 4.5 floor — the client name and date on the
                  selected project were the least readable text on the page,
                  which is exactly backwards for the row you're looking at.

                  --foreground-secondary measures 7.5:1 on the darkest heat
                  step, so one substitution covers all five.
                */
                "[&_.text-muted-2]:text-foreground-secondary",
                "[&_.text-muted-foreground]:text-foreground-secondary",
              ]
            : "bg-active"
          : "hover:bg-hover",
        className
      )}
    >
      {children}
    </button>
  );
}
