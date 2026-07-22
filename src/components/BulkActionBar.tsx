"use client";

import { ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  CircleDot,
  Flag,
  Plus,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Calendar } from "@/components/shadcn/calendar";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Popover";
import { PRIORITY_META } from "@/components/ui/PriorityPicker";
import { cn } from "@/lib/utils";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/types";
import type { FacetOption } from "@/components/FilterBar";

/**
 * Linear-style floating action bar shown while rows are multi-selected.
 * Every action fires once for the whole selection; the page owns the
 * optimistic update + single supabase `.in()` call. Esc clears selection
 * (handled by useMultiSelect); the ✕ button does the same.
 */
export function BulkActionBar({
  count,
  onClear,
  statuses,
  statusLabel = "Status",
  onSetStatus,
  assignees,
  assigneeLabel = "Assignee",
  onSetAssignee,
  showPriority = false,
  onSetPriority,
  showDue = false,
  dueLabel = "Due date",
  onSetDue,
  labels,
  labelActionLabel = "Label",
  onSetLabel,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  statuses?: string[];
  statusLabel?: string;
  onSetStatus?: (status: string) => void;
  assignees?: FacetOption[];
  assigneeLabel?: string;
  onSetAssignee?: (id: string | null) => void;
  showPriority?: boolean;
  onSetPriority?: (p: TaskPriority) => void;
  showDue?: boolean;
  dueLabel?: string;
  onSetDue?: (date: string | null) => void;
  /** Known labels offered as one-click options; free text is always allowed. */
  labels?: string[];
  labelActionLabel?: string;
  onSetLabel?: (label: string) => void;
  onDelete: () => void;
}) {
  if (count === 0) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 animate-pop">
      <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1.5 py-1.5 shadow-xl shadow-black/60">
        <span className="px-2 text-xs font-medium tabular-nums text-foreground">
          {count} selected
        </span>
        <Divider />

        {statuses && onSetStatus && (
          <Popover
            trigger={<BarButton icon={<CircleDot className="h-3.5 w-3.5" />}>{statusLabel}</BarButton>}
          >
            {(close) => (
              <>
                <MenuLabel>Set {statusLabel.toLowerCase()}</MenuLabel>
                {statuses.map((s) => (
                  <MenuItem
                    key={s}
                    onClick={() => {
                      onSetStatus(s);
                      close();
                    }}
                  >
                    {s}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
        )}

        {assignees && onSetAssignee && (
          <Popover
            trigger={<BarButton icon={<User className="h-3.5 w-3.5" />}>{assigneeLabel}</BarButton>}
          >
            {(close) => (
              <>
                <MenuLabel>Set {assigneeLabel.toLowerCase()}</MenuLabel>
                <MenuItem
                  onClick={() => {
                    onSetAssignee(null);
                    close();
                  }}
                >
                  Unassigned
                </MenuItem>
                {assignees.map((a) => (
                  <MenuItem
                    key={a.value}
                    onClick={() => {
                      onSetAssignee(a.value);
                      close();
                    }}
                  >
                    {a.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
        )}

        {showPriority && onSetPriority && (
          <Popover trigger={<BarButton icon={<Flag className="h-3.5 w-3.5" />}>Priority</BarButton>}>
            {(close) => (
              <>
                <MenuLabel>Set priority</MenuLabel>
                {TASK_PRIORITIES.map((p) => (
                  <MenuItem
                    key={p}
                    icon={
                      <Flag
                        className={cn("h-3.5 w-3.5", PRIORITY_META[p].className)}
                        fill={PRIORITY_META[p].fill ? "currentColor" : "none"}
                      />
                    }
                    onClick={() => {
                      onSetPriority(p);
                      close();
                    }}
                  >
                    {PRIORITY_META[p].label}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
        )}

        {showDue && onSetDue && (
          <Popover
            className="w-auto p-0"
            trigger={<BarButton icon={<CalendarIcon className="h-3.5 w-3.5" />}>{dueLabel}</BarButton>}
          >
            {(close) => (
              <div>
                <Calendar
                  mode="single"
                  weekStartsOn={1}
                  onSelect={(d: Date | undefined) => {
                    if (d) onSetDue(format(d, "yyyy-MM-dd"));
                    close();
                  }}
                />
                <div className="flex items-center justify-end border-t border-border-subtle px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSetDue(null);
                      close();
                    }}
                    className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  >
                    Clear {dueLabel.toLowerCase()}
                  </button>
                </div>
              </div>
            )}
          </Popover>
        )}

        {onSetLabel && (
          <Popover trigger={<BarButton icon={<Tag className="h-3.5 w-3.5" />}>{labelActionLabel}</BarButton>}>
            {(close) => (
              <LabelMenu
                labels={labels ?? []}
                onPick={(l) => {
                  onSetLabel(l);
                  close();
                }}
              />
            )}
          </Popover>
        )}

        <Divider />
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
        <button
          onClick={onClear}
          title="Clear selection (Esc)"
          className="ml-0.5 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
}

/* --------------------------------- Pieces --------------------------------- */

function BarButton({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-white/5 hover:text-foreground">
      {icon}
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />;
}

function LabelMenu({
  labels,
  onPick,
}: {
  labels: string[];
  onPick: (label: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <>
      <MenuLabel>Set label</MenuLabel>
      {labels.map((l) => (
        <MenuItem key={l} onClick={() => onPick(l)}>
          {l}
        </MenuItem>
      ))}
      {labels.length > 0 && <MenuSeparator />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const l = draft.trim();
          if (l) onPick(l);
        }}
        className="flex items-center gap-1 px-1 py-1"
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New label…"
          className="h-7 w-32 min-w-0 flex-1 rounded border border-white/15 bg-transparent px-2 text-xs text-foreground placeholder:text-muted-2 focus:border-primary/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
          title="Apply label"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
    </>
  );
}
