"use client";

import { ReactNode, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Provide a sort value to make this column's header click-to-sort. */
  sortKey?: (row: T) => string | number | null | undefined;
}

export interface TableSelection {
  selected: ReadonlySet<string>;
  /** `orderedIds` is the current visual (sorted) order, for shift-ranges. */
  onToggle: (id: string, shiftKey: boolean, orderedIds: string[]) => void;
  /** Header checkbox: select/deselect all currently visible rows. */
  onToggleAll?: (ids: string[], on: boolean) => void;
}

export function DataTable<T>({
  columns,
  rows,
  onRowClick,
  rowKey,
  emptyMessage = "No records yet.",
  selection,
}: {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  emptyMessage?: ReactNode;
  selection?: TableSelection;
}) {
  const [sort, setSort] = useState<{ index: number; dir: 1 | -1 } | null>(null);

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

  const sortedIds = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const anySelected = !!selection && selection.selected.size > 0;
  const allSelected =
    anySelected && sortedIds.length > 0 && sortedIds.every((id) => selection!.selected.has(id));

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-max text-[13px]">
        <thead>
          <tr className="group border-b border-border-subtle text-left text-xs text-muted-foreground">
            {selection && (
              <th className="w-9 pl-3 pr-0 py-2.5">
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
              <th key={i} className={cn("px-4 py-2.5 font-medium", col.className)}>
                {col.sortKey ? (
                  <button
                    onClick={() => cycleSort(i)}
                    title={`Sort by ${col.header}`}
                    className={cn(
                      "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
                      sort?.index === i && "text-foreground"
                    )}
                  >
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
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selection ? 1 : 0)}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
          {sorted.map((row, idx) => {
            const id = rowKey(row);
            const isSelected = !!selection?.selected.has(id);
            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(row)}
                style={{ animationDelay: `${Math.min(idx, 12) * 22}ms` }}
                className={cn(
                  "group animate-row border-b border-border-subtle last:border-0 transition-colors",
                  onRowClick && "cursor-pointer hover:bg-white/5",
                  isSelected && "bg-primary/5"
                )}
              >
                {selection && (
                  <td
                    className="w-9 py-2.5 pl-3 pr-0 align-middle"
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
                  <td key={i} className={cn("px-4 py-2.5 align-middle", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
