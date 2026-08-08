"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, statusTone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { dayOrder, formatTime, formatTimeRange } from "@/lib/taskTime";
import { Avatar } from "@/components/ui/Avatar";
import type { Project, ProjectTask, TaskStatus, TeamMember } from "@/lib/types";

/**
 * Read-only task views for the client portal: board, calendar, timeline.
 *
 * These are overviews only — comment threads and approve buttons live in the
 * List view on the portal page, which stays the interactive surface. Splitting
 * it this way keeps the alternate views simple and avoids four copies of the
 * approval logic.
 */

const BOARD_COLUMNS: TaskStatus[] = ["Not Started", "In Progress", "Done"];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type PortalView = "list" | "board" | "calendar" | "timeline";

interface ViewProps {
  tasks: ProjectTask[];
  projects: Project[];
  projectName: (id: string) => string;
  /** Staff lookup from the `team_directory` view — names and avatars only. */
  teamById: Map<string, TeamMember>;
}

/* ============================= BOARD ============================= */

export function PortalBoard({ tasks, projectName, teamById }: ViewProps) {
  const columns = useMemo(
    () =>
      BOARD_COLUMNS.map((status) => ({
        status,
        items: tasks.filter((t) => t.status === status),
      })),
    [tasks]
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {columns.map(({ status, items }) => (
        <div key={status} className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 px-0.5">
            <Badge tone={statusTone(status)} dot>
              {status}
            </Badge>
            <span className="text-xs text-muted-foreground">{items.length}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-raise p-2">
            {items.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nothing here</p>
            )}
            {items.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-border bg-surface p-2.5 shadow-sm"
              >
                <p className="flex items-start gap-1.5 text-[13px] font-medium leading-snug">
                  <span className="min-w-0 flex-1">{t.name}</span>
                  {t.approved_at && (
                    <CheckCheck className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                  )}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {projectName(t.project_id)}
                    {t.due_date ? ` · ${formatDate(t.due_date)}` : ""}
                    {formatTimeRange(t.due_time, t.end_time)
                      ? ` · ${formatTimeRange(t.due_time, t.end_time)}`
                      : ""}
                  </p>
                  {t.assigned_to && teamById.get(t.assigned_to) && (
                    <div title={teamById.get(t.assigned_to)!.full_name}>
                      <Avatar
                        name={teamById.get(t.assigned_to)!.full_name}
                        url={teamById.get(t.assigned_to)!.avatar_url}
                        size="xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ CALENDAR ============================ */

export function PortalCalendar({ tasks, projects, projectName }: ViewProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const month = addMonths(new Date(), monthOffset);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  /** Task due dates and project deadlines, keyed nowhere — matched per day. */
  const events = useMemo(() => {
    const out: {
      date: Date;
      label: string;
      /** All-day sorts first (-1), then by minutes past midnight. */
      sort: number;
      kind: "task" | "deadline";
      done: boolean;
    }[] = [];
    for (const t of tasks) {
      if (!t.due_date) continue;
      out.push({
        date: parseISO(t.due_date),
        // Time leads the label so the day cell reads in order at a glance.
        label: t.due_time ? `${formatTime(t.due_time)} ${t.name}` : t.name,
        sort: dayOrder(t),
        kind: "task",
        done: t.status === "Done",
      });
    }
    for (const p of projects) {
      if (!p.due_date) continue;
      out.push({
        date: parseISO(p.due_date),
        label: `${p.name} deadline`,
        // A project deadline is a whole-day marker; it has no clock time.
        sort: -1,
        kind: "deadline",
        done: p.status === "Delivered",
      });
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sort - b.sort);
  }, [tasks, projects]);

  void projectName;

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonthOffset((m) => m - 1)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMonthOffset(0)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonthOffset((m) => m + 1)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] font-medium text-muted-2">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(e.date, day));
          const outside = !isSameMonth(day, month);
          const today = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[68px] rounded-md border border-border-subtle p-1",
                outside && "opacity-40",
                today && "border-primary/40 bg-primary/5"
              )}
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  today ? "font-medium text-primary" : "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((e, i) => (
                  <span
                    key={i}
                    title={e.label}
                    className={cn(
                      "truncate rounded px-1 py-px text-[10px] leading-tight",
                      e.kind === "deadline"
                        ? "bg-warning/15 text-warning"
                        : e.done
                          ? "bg-success/15 text-success"
                          : "bg-primary/15 text-primary"
                    )}
                  >
                    {e.label}
                  </span>
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-2">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ TIMELINE ============================ */

export function PortalTimeline({ tasks, projects }: ViewProps) {
  /** One shared date range across every project so the bars are comparable. */
  const range = useMemo(() => {
    const stamps: number[] = [];
    for (const p of projects) {
      if (p.start_date) stamps.push(parseISO(p.start_date).getTime());
      if (p.due_date) stamps.push(parseISO(p.due_date).getTime());
    }
    for (const t of tasks) {
      if (t.due_date) stamps.push(parseISO(t.due_date).getTime());
    }
    if (stamps.length === 0) return null;
    const min = Math.min(...stamps);
    const max = Math.max(...stamps);
    // A zero-width range would divide by zero; pad it out to a month.
    const span = max - min || 1000 * 60 * 60 * 24 * 30;
    return { min, max: min + span, span };
  }, [projects, tasks]);

  if (!range) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-sm">
        No dates scheduled yet.
      </div>
    );
  }

  const pct = (stamp: number) => ((stamp - range.min) / range.span) * 100;
  const todayPct = pct(new Date().getTime());

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
      <div className="flex items-center justify-between text-[10px] text-muted-2">
        <span>{format(new Date(range.min), "MMM d, yyyy")}</span>
        <span>{format(new Date(range.max), "MMM d, yyyy")}</span>
      </div>

      {projects.map((p) => {
        const start = p.start_date ? parseISO(p.start_date).getTime() : range.min;
        const end = p.due_date ? parseISO(p.due_date).getTime() : range.max;
        const left = Math.max(0, pct(start));
        const width = Math.max(2, pct(end) - left);
        const projectTasks = tasks.filter((t) => t.project_id === p.id && t.due_date);
        return (
          <div key={p.id}>
            <div className="mb-1 flex items-center gap-2">
              <span className="truncate text-[13px] font-medium">{p.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {p.due_date ? `Due ${formatDate(p.due_date)}` : "No deadline"}
              </span>
            </div>
            <div className="relative h-6 overflow-hidden rounded-md bg-white/[0.03]">
              {todayPct >= 0 && todayPct <= 100 && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-danger/50"
                  style={{ left: `${todayPct}%` }}
                />
              )}
              <div
                className={cn(
                  "absolute top-1.5 h-3 rounded-full",
                  p.status === "Delivered" ? "bg-success/50" : "bg-primary/40"
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
              {projectTasks.map((t) => (
                <span
                  key={t.id}
                  title={`${t.name} · ${formatDate(t.due_date!)}`}
                  className={cn(
                    "absolute top-[9px] h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-surface",
                    t.status === "Done" ? "bg-success" : "bg-foreground/70"
                  )}
                  style={{ left: `${pct(parseISO(t.due_date!).getTime())}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
