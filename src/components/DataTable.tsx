"use client";

import { ReactNode, useMemo, useState } from "react";
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-react";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/Popover";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /**
   * Column width, as any CSS length or percentage.
   *
   * The table lays out `table-fixed`, so widths come from here and nowhere
   * else. Leave it off and the column splits whatever space the sized columns
   * didn't take. Set it on the narrow, predictable ones (status, money, dates)
   * and let the name column absorb the rest — that's the layout that holds
   * still while you page through.
   */
  width?: string;
  /** Provide a sort value to make this column's header click-to-sort. */
  sortKey?: (row: T) => string | number | null | undefined;
  /**
   * Small glyph in the header saying what kind of data this column holds —
   * person, email, date, number, status. Lifted from the reference table: it
   * costs one icon and tells you what a column contains before you've read a
   * single row, which matters most on the columns you scroll past.
   */
  icon?: LucideIcon;
  /**
   * Where this column goes when the table becomes a card list below `sm`.
   *
   * Opt-in on purpose. Nine columns stacked into a card is the same bug as
   * nine columns squeezed into 390px — measured on device 7 Aug, Clients was
   * clipping email addresses mid-address with more columns off-screen right.
   * Columns with no hint are dropped on mobile.
   *
   * If NO column on a table declares a hint, the first three are used as
   * title / meta / meta so every existing table degrades sensibly without a
   * migration. Declare hints to do better than that default.
   */
  mobile?: "title" | "subtitle" | "meta" | "trailing" | "hidden";
}

export interface TableSelection {
  selected: ReadonlySet<string>;
  /** `orderedIds` is the current visual (sorted) order, for shift-ranges. */
  onToggle: (id: string, shiftKey: boolean, orderedIds: string[]) => void;
  /** Header checkbox: select/deselect all currently visible rows. */
  onToggleAll?: (ids: string[], on: boolean) => void;
}

/**
 * Page buttons to render: always first and last, the current page and its
 * neighbours, `null` where a gap belongs.
 */
function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const out: (number | null)[] = [0];
  const from = Math.max(1, current - 1);
  const to = Math.min(total - 2, current + 1);
  if (from > 1) out.push(null);
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 2) out.push(null);
  out.push(total - 1);
  return out;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  rowKey,
  emptyMessage = "No records yet.",
  selection,
  isDimmed,
  minWidth = "980px",
  pageSize,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  emptyMessage?: ReactNode;
  selection?: TableSelection;
  /**
   * Fade a row that's no longer live — inactive staff, rejected applicants.
   * The reference dims the entire row rather than relying on a status pill,
   * and it's the cheapest signal in that whole screen: you stop reading those
   * rows without having to check a column.
   */
  isDimmed?: (row: T) => boolean;
  /**
   * Minimum table width before the wrapper starts scrolling horizontally.
   * Fixed layout squeezes columns to fit rather than overflowing, so without
   * a floor the columns get unreadably narrow on a phone.
   */
  minWidth?: string;
  /**
   * Rows per page. Omit for no pagination.
   *
   * Paging is client-side, over rows already in memory — the whole table is
   * fetched up front (see lib/useSupabaseTable). That's a real limit worth
   * naming: this makes long lists *readable*, it doesn't make them *cheap*.
   * Server-side paging is the fix when the tables get big, and it belongs in
   * the query layer rather than here.
   */
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const key = sort ? columns[sort.index]?.sortKey : undefined;
    if (!sort || !key) return rows;
    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // empty values sink regardless of direction
      if (bv == null) return -1;
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);

  /** Click cycles: unsorted → ascending → descending → unsorted. */
  function cycleSort(index: number) {
    setSort((s) => {
      if (s?.index !== index) return { index, dir: 1 };
      return s.dir === 1 ? { index, dir: -1 } : null;
    });
  }

  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;

  /*
   * Filtering can leave you on a page that no longer exists. Clamp on render
   * rather than syncing state in an effect: the stored page may be stale but
   * `safePage` is always valid, and every read goes through it. Writing state
   * back from an effect would cause a second render for no benefit — and it's
   * what react-hooks/set-state-in-effect is there to stop.
   */
  const safePage = Math.min(page, totalPages - 1);

  const visible = useMemo(
    () => (pageSize ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted),
    [sorted, pageSize, safePage]
  );

  const sortedIds = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const anySelected = !!selection && selection.selected.size > 0;
  const allSelected =
    anySelected && sortedIds.length > 0 && sortedIds.every((id) => selection!.selected.has(id));

  /*
   * Which columns land where on a card.
   *
   * The shape is lifted from the LeadIQ reference: a prominent title with a
   * quieter subtitle under it, a trailing value on the right of the same row,
   * then a two-column grid of icon+value pairs. It reads at a glance and it
   * maps onto what these tables already carry.
   */
  const slots = useMemo(() => {
    const declared = columns.some((c) => c.mobile);
    if (!declared) {
      // No hints yet: first column titles the card, next two become meta.
      // Deliberately conservative — better a thin card than a wall of fields.
      return {
        title: columns[0],
        subtitle: undefined as Column<T> | undefined,
        trailing: undefined as Column<T> | undefined,
        meta: columns.slice(1, 3),
      };
    }
    return {
      title: columns.find((c) => c.mobile === "title") ?? columns[0],
      subtitle: columns.find((c) => c.mobile === "subtitle"),
      trailing: columns.find((c) => c.mobile === "trailing"),
      meta: columns.filter((c) => c.mobile === "meta"),
    };
  }, [columns]);

  const sortable = useMemo(
    () => columns.map((c, i) => ({ col: c, i })).filter((x) => x.col.sortKey),
    [columns]
  );

  /* Shared by both layouts — mobile lost paging entirely when the cards were
     added, which on a 50-row table is a worse regression than the table was. */
  const pager =
    pageSize && sorted.length > pageSize ? (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs",
          // Its own bordered box under the cards; a plain footer rule inside
          // the table box on desktop.
          "mt-2 rounded-md border border-border",
          "sm:mt-0 sm:rounded-none sm:border-0 sm:border-t sm:border-border-subtle"
        )}
      >
          <span className="text-muted-foreground">
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
              className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
  
            {/* Numbered, not just arrows — jumping to page 4 is a real thing
                you want to do, and "Page 2 of 5" alone doesn't let you. Capped
                at seven buttons with an ellipsis so a long list can't turn the
                footer into its own paragraph. */}
            {pageNumbers(safePage, totalPages).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="px-1 text-muted-2">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    "min-w-[1.75rem] rounded-md px-1.5 py-1 tabular-nums transition-colors",
                    n === safePage
                      ? "bg-white/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  {n + 1}
                </button>
              )
            )}
  
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="Next page"
              className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
    ) : null;

  return (
    <>
    {/* ── Cards, below sm ─────────────────────────────────────────────── */}
    <div className="sm:hidden">
      {sortable.length > 0 && (
        /*
         * One control, not a chip per column.
         *
         * This started as a row of six chips — Company, Status, Email, Owner,
         * Portal, Last Contact — which was a whole row of chrome competing
         * with the data for a job you do occasionally. The references all use
         * a single "Sort by". Fewer things on screen is the point.
         */
        <div className="-mt-1 mb-2 flex justify-end">
          <Popover
            align="right"
            className="w-48"
            trigger={
              <button className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground active:bg-white/5">
                <ArrowUpDown className="h-3.5 w-3.5" />
                {sort ? columns[sort.index]?.header || "Sorted" : "Sort"}
                {sort && (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Sort by</MenuLabel>
                {sortable.map(({ col, i }) => (
                  <MenuItem
                    key={i}
                    selected={sort?.index === i}
                    onClick={() => {
                      cycleSort(i);
                      close();
                    }}
                  >
                    {col.header}
                  </MenuItem>
                ))}
                {sort && (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      onClick={() => {
                        setSort(null);
                        close();
                      }}
                    >
                      Clear sort
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Popover>
        </div>
      )}

      {/* The empty state is a div, not a p. `emptyMessage` is a ReactNode and
          every caller passes a whole <EmptyState>, so a p here nests a div
          inside a p — invalid HTML, and React reports it as a hydration error.
          Caught in the browser; tsc and eslint were both clean. */}
      {visible.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visible.map((row) => {
            const id = rowKey(row);
            return (
              <li key={id}>
                <div
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors",
                    onRowClick && "cursor-pointer active:bg-white/5",
                    isDimmed?.(row) && "opacity-45"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="min-w-0 text-[13px] font-medium">
                        {slots.title?.render(row)}
                      </div>
                      {slots.subtitle && (
                        <div className="mt-0.5 min-w-0 text-xs text-muted-foreground">
                          {slots.subtitle.render(row)}
                        </div>
                      )}
                    </div>
                    {slots.trailing && (
                      <div className="shrink-0 text-right text-[13px]">
                        {slots.trailing.render(row)}
                      </div>
                    )}
                  </div>

                  {slots.meta.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {slots.meta.map((col, i) => (
                        <div key={i} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {col.icon ? (
                            <col.icon className="h-3 w-3 shrink-0" />
                          ) : (
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-2">
                              {col.header}
                            </span>
                          )}
                          <span className="min-w-0 truncate">{col.render(row)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>

    {/* ── Table, sm and up ────────────────────────────────────────────── */}
    <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
      {/*
       * table-fixed, not the browser default.
       *
       * With auto layout the browser measures the cells it's rendering and
       * sizes the columns to fit them — so paging to a set of rows with longer
       * client names silently moved every column. Fixed layout takes its
       * widths from the colgroup below and ignores content entirely, which is
       * what makes the table hold still while you page and makes every table
       * in the app line up with the others.
       */}
      <table className="w-full table-fixed text-[13px]" style={{ minWidth }}>
        <colgroup>
          {selection && <col style={{ width: "2.25rem" }} />}
          {columns.map((col, i) => (
            <col key={i} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="group border-b border-border-subtle text-left text-xs text-muted-foreground">
            {selection && (
              <th className="w-9 pl-3 pr-0 py-2">
                {selection.onToggleAll && (
                  <SelectBox
                    checked={allSelected}
                    visible={anySelected}
                    title={allSelected ? "Deselect all" : "Select all"}
                    onClick={() => selection.onToggleAll!(sortedIds, !allSelected)}
                  />
                )}
              </th>
            )}
            {columns.map((col, i) => (
              <th key={i} className={cn("truncate px-4 py-2 font-medium", col.className)}>
                {col.sortKey ? (
                  <button
                    onClick={() => cycleSort(i)}
                    title={`Sort by ${col.header}`}
                    className={cn(
                      "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort?.index === i && "text-foreground"
                    )}
                  >
                    {col.icon && <col.icon className="h-3 w-3 text-muted-2" />}
                    {col.header}
                    {sort?.index === i ? (
                      sort.dir === 1 ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                    )}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {col.icon && <col.icon className="h-3 w-3 text-muted-2" />}
                    {col.header}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selection ? 1 : 0)}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {visible.map((row, idx) => {
            const id = rowKey(row);
            const isSelected = !!selection?.selected.has(id);
            const dimmed = !!isDimmed?.(row);
            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(row)}
                style={{ animationDelay: `${Math.min(idx, 12) * 22}ms` }}
                className={cn(
                  "group animate-row border-b border-border-subtle last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-white/5",
                  isSelected && "bg-primary/5",
                  // Opacity, not a grey text colour — it fades the badges and
                  // avatars too, which is the point.
                  dimmed && "opacity-45 hover:opacity-80"
                )}
              >
                {selection && (
                  <td
                    className="w-9 py-2 pl-3 pr-0 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SelectBox
                      checked={isSelected}
                      visible={anySelected}
                      title="Select row (shift-click for a range)"
                      onClick={(e) => selection.onToggle(id, e.shiftKey, sortedIds)}
                    />
                  </td>
                )}
                {columns.map((col, i) => (
                  <td
                    key={i}
                    /* Fixed layout can't grow a column to fit its content, so
                       anything too long has to clip rather than wrap — wrapping
                       would make row heights jump between pages, which is the
                       same problem in a different direction. */
                    className={cn("truncate px-4 py-2 align-middle", col.className)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {pager}
    </>
  );
}

/** Hover-reveal checkbox; stays visible while any row is selected. */
function SelectBox({
  checked,
  visible,
  title,
  onClick,
}: {
  checked: boolean;
  visible: boolean;
  title?: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => {
        // Keep shift-click from selecting page text.
        if (e.shiftKey) e.preventDefault();
      }}
      title={title}
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded border transition-[opacity,background-color,border-color]",
        checked
          ? "border-primary bg-primary opacity-100"
          : cn(
              "border-muted-2 hover:border-muted-foreground",
              visible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )
      )}
    >
      {checked && <Check className="h-3 w-3 text-primary-foreground" />}
    </button>
  );
}
