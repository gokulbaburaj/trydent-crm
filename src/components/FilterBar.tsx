"use client";

import { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  Bookmark,
  Check,
  ChevronDown,
  Flag,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { toast } from "@/components/Toaster";
import { Calendar } from "@/components/shadcn/calendar";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Popover";
import { PRIORITY_META } from "@/components/ui/PriorityPicker";
import { cn } from "@/lib/utils";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/types";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  filterSignature,
  UNASSIGNED,
  type DueRange,
  type FilterState,
  type SavedView,
} from "@/lib/filters";

export interface FacetOption {
  value: string;
  label: string;
}

/**
 * Reusable filter bar: free-text + facet popovers + due-date range,
 * active filters as removable chips, and a saved-views dropdown
 * (save current / rename / delete) persisted per page via useStoredFilters.
 */
export function FilterBar({
  filters,
  onChange,
  views,
  onViewsChange,
  statuses,
  statusLabel = "Status",
  assignees,
  labels,
  priorities = false,
  showDue = false,
  dueLabel = "Due",
  placeholder = "Filter…",
}: {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  views: SavedView[];
  onViewsChange: (v: SavedView[]) => void;
  /** Status options; omit to hide the facet. */
  statuses?: string[];
  statusLabel?: string;
  /** Assignee options; omit to hide the facet. "Unassigned" is added automatically. */
  assignees?: FacetOption[];
  /** Label/tag options; omit (or pass empty) to hide the facet. */
  labels?: string[];
  /** Show the task-priority facet. */
  priorities?: boolean;
  /** Show the due-date range facet. */
  showDue?: boolean;
  dueLabel?: string;
  placeholder?: string;
}) {
  const active = countActiveFilters(filters);
  const sig = filterSignature(filters);
  const activeView = views.find((v) => filterSignature(v.filters) === sig) ?? null;

  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  function toggle(key: "assignee" | "status" | "label" | "priority", value: string) {
    const cur = filters[key];
    set({
      [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value],
    });
  }

  const assigneeLabel = (id: string) =>
    id === UNASSIGNED
      ? "Unassigned"
      : assignees?.find((a) => a.value === id)?.label ?? "Unknown";

  function saveCurrent() {
    const name = window.prompt("Save view as:", activeView?.name ?? "")?.trim();
    if (!name) return;
    const next = views.some((v) => v.name === name)
      ? views.map((v) => (v.name === name ? { name, filters } : v))
      : [...views, { name, filters }];
    onViewsChange(next);
    toast.success(`View “${name}” saved`);
  }

  function renameView(view: SavedView) {
    const name = window.prompt("Rename view:", view.name)?.trim();
    if (!name || name === view.name) return;
    if (views.some((v) => v.name === name)) {
      toast.error(`A view named “${name}” already exists`);
      return;
    }
    onViewsChange(views.map((v) => (v.name === view.name ? { ...v, name } : v)));
    toast.success(`Renamed to “${name}”`);
  }

  function deleteView(view: SavedView) {
    if (!confirm(`Delete view “${view.name}”?`)) return;
    onViewsChange(views.filter((v) => v.name !== view.name));
    toast.success(`View “${view.name}” deleted`);
  }

  const dueRange: DayPickerRange | undefined =
    filters.due.from || filters.due.to
      ? {
          from: filters.due.from ? parseISO(filters.due.from) : undefined,
          to: filters.due.to ? parseISO(filters.due.to) : undefined,
        }
      : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Free-text filter */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder={placeholder}
            className="h-8 w-52 rounded-md border border-white/15 bg-transparent pl-8 pr-7 text-[13px] text-foreground shadow-sm placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/20"
          />
          {filters.text && (
            <button
              onClick={() => set({ text: "" })}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="Clear text"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {statuses && (
          <Facet label={statusLabel} count={filters.status.length}>
            <MenuLabel>{statusLabel}</MenuLabel>
            {statuses.map((s) => (
              <MenuItem
                key={s}
                selected={filters.status.includes(s)}
                onClick={() => toggle("status", s)}
              >
                {s}
              </MenuItem>
            ))}
          </Facet>
        )}

        {assignees && (
          <Facet label="Assignee" count={filters.assignee.length}>
            <MenuLabel>Assignee</MenuLabel>
            <MenuItem
              selected={filters.assignee.includes(UNASSIGNED)}
              onClick={() => toggle("assignee", UNASSIGNED)}
            >
              Unassigned
            </MenuItem>
            {assignees.map((a) => (
              <MenuItem
                key={a.value}
                selected={filters.assignee.includes(a.value)}
                onClick={() => toggle("assignee", a.value)}
              >
                {a.label}
              </MenuItem>
            ))}
          </Facet>
        )}

        {labels && labels.length > 0 && (
          <Facet label="Label" count={filters.label.length}>
            <MenuLabel>Label</MenuLabel>
            {labels.map((l) => (
              <MenuItem
                key={l}
                selected={filters.label.includes(l)}
                onClick={() => toggle("label", l)}
              >
                {l}
              </MenuItem>
            ))}
          </Facet>
        )}

        {priorities && (
          <Facet label="Priority" count={filters.priority.length}>
            <MenuLabel>Priority</MenuLabel>
            {TASK_PRIORITIES.map((p) => (
              <MenuItem
                key={p}
                selected={filters.priority.includes(p)}
                icon={
                  <Flag
                    className={cn("h-3.5 w-3.5", PRIORITY_META[p].className)}
                    fill={PRIORITY_META[p].fill ? "currentColor" : "none"}
                  />
                }
                onClick={() => toggle("priority", p)}
              >
                {PRIORITY_META[p].label}
              </MenuItem>
            ))}
          </Facet>
        )}

        {showDue && (
          <Facet label={dueLabel} count={filters.due.from || filters.due.to ? 1 : 0}>
            <Calendar
              mode="range"
              weekStartsOn={1}
              selected={dueRange}
              defaultMonth={filters.due.from ? parseISO(filters.due.from) : new Date()}
              onSelect={(r: DayPickerRange | undefined) =>
                set({
                  due: {
                    from: r?.from ? format(r.from, "yyyy-MM-dd") : null,
                    to: r?.to ? format(r.to, "yyyy-MM-dd") : null,
                  },
                })
              }
            />
            <div className="flex items-center justify-between border-t border-border-subtle px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                {filters.due.from || filters.due.to
                  ? rangeLabel(filters.due)
                  : "Pick a start and end day"}
              </span>
              <button
                type="button"
                onClick={() => set({ due: { from: null, to: null } })}
                className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </Facet>
        )}

        {/* Saved views */}
        <div className="ml-auto">
          <Popover
            align="right"
            trigger={
              <button className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground-secondary hover:bg-white/5 hover:text-foreground">
                <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="max-w-36 truncate">{activeView?.name ?? "Views"}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Saved views</MenuLabel>
                {views.length === 0 && (
                  <p className="px-2 pb-1.5 text-xs text-muted-2">No saved views yet.</p>
                )}
                {views.map((v) => (
                  <div
                    key={v.name}
                    className="group flex items-center gap-0.5 rounded-md hover:bg-white/5"
                  >
                    <button
                      onClick={() => {
                        onChange(v.filters);
                        close();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-foreground-secondary group-hover:text-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">{v.name}</span>
                      {activeView?.name === v.name && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      title="Rename view"
                      onClick={() => renameView(v)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      title="Delete view"
                      onClick={() => deleteView(v)}
                      className="mr-1 rounded p-1 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <MenuSeparator />
                <MenuItem
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close();
                    saveCurrent();
                  }}
                >
                  Save current view…
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      {/* Active filter chips */}
      {active > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.text.trim() && (
            <Chip onRemove={() => set({ text: "" })}>“{filters.text.trim()}”</Chip>
          )}
          {filters.status.map((s) => (
            <Chip key={s} onRemove={() => toggle("status", s)}>
              {statusLabel}: {s}
            </Chip>
          ))}
          {filters.assignee.map((a) => (
            <Chip key={a} onRemove={() => toggle("assignee", a)}>
              Assignee: {assigneeLabel(a)}
            </Chip>
          ))}
          {filters.label.map((l) => (
            <Chip key={l} onRemove={() => toggle("label", l)}>
              Label: {l}
            </Chip>
          ))}
          {filters.priority.map((p) => (
            <Chip key={p} onRemove={() => toggle("priority", p)}>
              Priority: {PRIORITY_META[p as TaskPriority]?.label ?? p}
            </Chip>
          ))}
          {(filters.due.from || filters.due.to) && (
            <Chip onRemove={() => set({ due: { from: null, to: null } })}>
              {dueLabel}: {rangeLabel(filters.due)}
            </Chip>
          )}
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Pieces --------------------------------- */

function Facet({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Popover
      trigger={
        <button
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
            count > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground-secondary hover:bg-white/5 hover:text-foreground"
          )}
        >
          <ListFilter className="h-3 w-3 opacity-70" />
          {label}
          {count > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">
              {count}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      }
    >
      {children}
    </Popover>
  );
}

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white/5 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-foreground-secondary">
      {children}
      <button
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        title="Remove filter"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function rangeLabel(due: DueRange) {
  const fmt = (d: string) => format(parseISO(d), "MMM d");
  if (due.from && due.to) return `${fmt(due.from)} – ${fmt(due.to)}`;
  if (due.from) return `after ${fmt(due.from)}`;
  if (due.to) return `before ${fmt(due.to)}`;
  return "";
}
