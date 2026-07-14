"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getHours,
  getMinutes,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  setHours,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, List, Plus, User } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/utils";
import type { Activity, Client, Deal, Profile, Project, ProjectTask } from "@/lib/types";

type Tab = "all" | "mine" | "calendar";
type CalView = "week" | "month";

const emptyForm: Partial<Activity> = {
  description: "",
  outcome: "",
  location: "",
  follow_up_required: false,
  client_id: null,
  deal_id: null,
  assigned_to: null,
  activity_date: new Date().toISOString().slice(0, 16),
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Pixel height of one hour row in the week grid. */
const HOUR_HEIGHT = 56;
/** Default event duration (minutes) — activities only store a start time. */
const EVENT_MINUTES = 60;

/** Pastel event palette lifted from Linear's calendar screenshots. */
const EVENT_COLORS = [
  { bg: "var(--event-blue-bg)", bar: "var(--event-blue-bar)" },
  { bg: "var(--event-purple-bg)", bar: "var(--event-purple-bar)" },
  { bg: "var(--event-yellow-bg)", bar: "var(--event-yellow-bar)" },
  { bg: "var(--event-pink-bg)", bar: "var(--event-pink-bar)" },
];

function eventColor(a: Activity) {
  const key = a.client_id ?? a.id;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

/** Assign overlapping events to side-by-side columns within a day. */
function layoutDay(events: Activity[]) {
  const sorted = [...events].sort(
    (a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime()
  );
  const startMin = (a: Activity) => {
    const d = parseISO(a.activity_date);
    return getHours(d) * 60 + getMinutes(d);
  };
  const placed: { a: Activity; col: number; cols: number; start: number }[] = [];
  let cluster: { a: Activity; col: number; start: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const cols = Math.max(...cluster.map((c) => c.col), 0) + 1;
    for (const c of cluster) placed.push({ a: c.a, col: c.col, cols, start: c.start });
    cluster = [];
  };

  for (const a of sorted) {
    const s = startMin(a);
    if (cluster.length > 0 && s >= clusterEnd) flush();
    const used = cluster.filter((c) => c.start + EVENT_MINUTES > s).map((c) => c.col);
    let col = 0;
    while (used.includes(col)) col++;
    cluster.push({ a, col, start: s });
    clusterEnd = Math.max(clusterEnd, s + EVENT_MINUTES);
  }
  if (cluster.length > 0) flush();
  return placed;
}

export default function SchedulePage() {
  const { profile } = useAuth();
  const { rows: activities, setRows } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: projectTasks } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: projects } = useSupabaseTable<Project>("projects");

  const [tab, setTab] = useState<Tab>("all");
  const [calView, setCalView] = useState<CalView>("week");
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [saving, setSaving] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.company ?? "—";
  const assigneeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const filtered = useMemo(
    () => (tab === "mine" && profile ? activities.filter((a) => a.assigned_to === profile.id) : activities),
    [activities, tab, profile]
  );

  const columns: Column<Activity>[] = [
    { header: "Description", render: (a) => <span className="font-medium">{a.description}</span> },
    { header: "Client", render: (a) => clientName(a.client_id) },
    { header: "Assigned To", render: (a) => assigneeName(a.assigned_to) },
    { header: "Date", render: (a) => formatDate(a.activity_date) },
    {
      header: "Follow-up",
      render: (a) =>
        a.follow_up_required ? (
          <Badge tone="yellow" dot>Required</Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("activities")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) setRows((prev) => prev.map((a) => (a.id === data.id ? (data as Activity) : a)));
    } else {
      const { data, error } = await supabase.from("activities").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as Activity, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this schedule item?")) return;
    await supabase.from("activities").delete().eq("id", id);
    setRows((prev) => prev.filter((a) => a.id !== id));
    setEditing(null);
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of activities) {
      const key = format(parseISO(a.activity_date), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [activities]);

  const dayEvents = (day: Date) => eventsByDay.get(format(day, "yyyy-MM-dd")) ?? [];

  const tasksByDay = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const t of projectTasks) {
      if (!t.due_date || t.status === "Archived") continue;
      const key = t.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [projectTasks]);

  const dayTasks = (day: Date) => tasksByDay.get(format(day, "yyyy-MM-dd")) ?? [];
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  const goPrev = () =>
    setAnchor((d) => (calView === "week" ? subWeeks(d, 1) : subMonths(d, 1)));
  const goNext = () =>
    setAnchor((d) => (calView === "week" ? addWeeks(d, 1) : addMonths(d, 1)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded border border-border bg-surface p-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={List} label="All" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} icon={User} label="Mine" />
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="Calendar" />
        </div>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>
          <Plus className="h-4 w-4" /> New Schedule Item
        </Button>
      </div>

      {tab !== "calendar" ? (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(a) => a.id}
          onRowClick={setEditing}
          emptyMessage="No schedule items yet."
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              {format(anchor, "MMMM")}{" "}
              <span className="font-normal text-muted">{format(anchor, "yyyy")}</span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded border border-border bg-surface">
                <button
                  onClick={goPrev}
                  className="flex h-7 w-7 items-center justify-center text-muted hover:bg-white/5 hover:text-foreground"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setAnchor(new Date())}
                  className="px-2.5 text-xs font-medium text-muted hover:text-foreground"
                >
                  Today
                </button>
                <button
                  onClick={goNext}
                  className="flex h-7 w-7 items-center justify-center text-muted hover:bg-white/5 hover:text-foreground"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-0.5 rounded border border-border bg-surface p-0.5">
                <button
                  onClick={() => setCalView("week")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    calView === "week" ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground-secondary"
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalView("month")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    calView === "month" ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground-secondary"
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          {calView === "week" ? (
            <WeekGrid
              anchor={anchor}
              dayEvents={dayEvents}
              dayTasks={dayTasks}
              projectName={projectName}
              clientName={clientName}
              onEventClick={setEditing}
              onSlotClick={(dt) =>
                setEditing({ ...emptyForm, activity_date: format(dt, "yyyy-MM-dd'T'HH:mm") })
              }
            />
          ) : (
            <MonthGrid
              anchor={anchor}
              activities={activities}
              dayEvents={dayEvents}
              dayTasks={dayTasks}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              clientName={clientName}
              onEventClick={setEditing}
            />
          )}
        </>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Schedule Item" : "New Schedule Item"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Description</Label>
              <Textarea
                required
                rows={2}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Outcome</Label>
              <Input
                value={editing.outcome ?? ""}
                onChange={(e) => setEditing({ ...editing, outcome: e.target.value })}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={editing.location ?? ""}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Select
                value={editing.client_id ?? ""}
                onChange={(e) => setEditing({ ...editing, client_id: e.target.value || null })}
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Deal</Label>
              <Select
                value={editing.deal_id ?? ""}
                onChange={(e) => setEditing({ ...editing, deal_id: e.target.value || null })}
              >
                <option value="">—</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.deal_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={editing.assigned_to ?? ""}
                onChange={(e) => setEditing({ ...editing, assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="datetime-local"
                value={
                  editing.activity_date
                    ? new Date(editing.activity_date).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => setEditing({ ...editing, activity_date: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.follow_up_required}
                onChange={(e) => setEditing({ ...editing, follow_up_required: e.target.checked })}
                className="h-4 w-4 rounded accent-accent"
              />
              Follow-up required
            </label>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              {editing.id && (
                <Button type="button" variant="danger" onClick={() => handleDelete(editing.id as string)}>
                  Delete
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}

/* ---------------------------------- Week view ---------------------------------- */

function WeekGrid({
  anchor,
  dayEvents,
  dayTasks,
  projectName,
  clientName,
  onEventClick,
  onSlotClick,
}: {
  anchor: Date;
  dayEvents: (day: Date) => Activity[];
  dayTasks: (day: Date) => ProjectTask[];
  projectName: (id: string) => string;
  clientName: (id: string | null) => string;
  onEventClick: (a: Activity) => void;
  onSlotClick: (dt: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(anchor, { weekStartsOn: 1 }) });
  }, [anchor]);

  useEffect(() => {
    // Open the grid at 8:00 so the workday is in view.
    scrollRef.current?.scrollTo({ top: 8 * HOUR_HEIGHT });
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      {/* Day headers */}
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border">
        <div className="flex items-end justify-center pb-2 pt-3 text-[11px] font-medium text-muted-2">
          {format(days[0], "'W' w")}
        </div>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="flex items-center justify-center gap-1.5 border-l border-border-subtle pb-2 pt-3 text-[13px]"
          >
            <span className={isToday(day) ? "font-medium text-foreground" : "text-muted"}>
              {format(day, "EEE")}
            </span>
            <span
              className={
                isToday(day)
                  ? "flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white"
                  : "text-foreground-secondary"
              }
            >
              {format(day, "d")}
            </span>
          </div>
        ))}
      </div>

      {/* All-day row: project tasks due that day */}
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border">
        <div className="flex items-center justify-end pr-2 text-[10px] text-muted-2">tasks</div>
        {days.map((day) => {
          const dts = dayTasks(day);
          return (
            <div
              key={day.toISOString()}
              className="flex min-h-7 flex-col gap-0.5 border-l border-border-subtle p-0.5"
            >
              {dts.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${t.project_id}`}
                  title={`${t.name} — ${projectName(t.project_id)}`}
                  className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                  style={{
                    background: "var(--event-indigo-bg)",
                    boxShadow: "inset 3px 0 0 0 var(--event-indigo-bar)",
                  }}
                >
                  {t.name}
                </Link>
              ))}
              {dts.length > 3 && (
                <span className="px-1.5 text-[10px] text-muted">+{dts.length - 3} more</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="max-h-[640px] overflow-y-auto">
        <div className="grid grid-cols-[3.5rem_repeat(7,1fr)]">
          {/* Hour gutter */}
          <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
            {hours.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-2"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {h === 0 ? "" : String(h).padStart(2, "0")}
              </span>
            ))}
          </div>

          {days.map((day) => {
            const placed = layoutDay(dayEvents(day));
            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-border-subtle"
                style={{ height: 24 * HOUR_HEIGHT }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-event]")) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT);
                  onSlotClick(setHours(day, hour));
                }}
              >
                {/* Hour lines */}
                {hours.slice(1).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border-subtle"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {/* Now indicator */}
                {isToday(day) && <NowLine />}

                {/* Events */}
                {placed.map(({ a, col, cols }) => {
                  const d = parseISO(a.activity_date);
                  const top = (getHours(d) + getMinutes(d) / 60) * HOUR_HEIGHT;
                  const color = eventColor(a);
                  const width = 100 / cols;
                  return (
                    <button
                      key={a.id}
                      data-event
                      onClick={() => onEventClick(a)}
                      className="absolute overflow-hidden rounded px-1.5 py-1 text-left"
                      style={{
                        top: top + 1,
                        height: (EVENT_MINUTES / 60) * HOUR_HEIGHT - 2,
                        left: `calc(${col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        background: color.bg,
                        boxShadow: `inset 3px 0 0 0 ${color.bar}`,
                      }}
                    >
                      <p className="truncate text-[11px] font-semibold leading-tight text-[#16171b]">
                        {format(d, "H:mm")}{" "}
                        <span className="font-medium">{a.description}</span>
                      </p>
                      <p className="truncate text-[10px] leading-tight text-[#16171b]/70">
                        {clientName(a.client_id)}
                      </p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const top = (getHours(now) + getMinutes(now) / 60) * HOUR_HEIGHT;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top }}>
      <div className="relative border-t border-danger">
        <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-danger" />
      </div>
    </div>
  );
}

/* ---------------------------------- Month view ---------------------------------- */

function MonthGrid({
  anchor,
  activities,
  dayEvents,
  dayTasks,
  selectedDay,
  setSelectedDay,
  clientName,
  onEventClick,
}: {
  anchor: Date;
  activities: Activity[];
  dayEvents: (day: Date) => Activity[];
  dayTasks: (day: Date) => ProjectTask[];
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  clientName: (id: string | null) => string;
  onEventClick: (a: Activity) => void;
}) {
  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [anchor]);

  const upcomingOrSelected = useMemo(() => {
    if (selectedDay) return dayEvents(selectedDay);
    const now = new Date();
    return activities
      .filter((a) => parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, activities]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((day) => {
            const inMonth = isSameMonth(day, anchor);
            const hasEvents = dayEvents(day).length > 0 || dayTasks(day).length > 0;
            const selected = !!selectedDay && isSameDay(day, selectedDay);
            return (
              <button
                key={day.toISOString()}
                onClick={() =>
                  setSelectedDay(selectedDay && isSameDay(day, selectedDay) ? null : day)
                }
                className={dayCellClass(inMonth, isToday(day), selected)}
              >
                <span className="relative">
                  {format(day, "d")}
                  {hasEvents && (
                    <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-muted">
          {selectedDay ? format(selectedDay, "MMMM d, yyyy") : "Upcoming"}
        </h3>
        <div className="flex flex-col divide-y divide-border">
          {upcomingOrSelected.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No events.</p>
          )}
          {upcomingOrSelected.map((a) => (
            <button
              key={a.id}
              onClick={() => onEventClick(a)}
              className="flex items-center gap-3 py-3 text-left hover:bg-white/5"
            >
              <div className="flex w-11 shrink-0 flex-col items-center rounded bg-white/10 py-1.5">
                <span className="text-sm font-bold">{format(parseISO(a.activity_date), "d")}</span>
                <span className="text-[10px] uppercase text-muted">
                  {format(parseISO(a.activity_date), "EEE")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.description}</p>
                <p className="truncate text-xs text-muted">{clientName(a.client_id)}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {format(parseISO(a.activity_date), "h:mm a")}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
        active ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function dayCellClass(inMonth: boolean, today: boolean, selected: boolean) {
  const base = "flex h-10 items-center justify-center rounded text-sm transition-colors";
  if (selected) return `${base} bg-accent text-accent-foreground font-semibold`;
  if (today) return `${base} border border-accent text-accent font-semibold`;
  if (!inMonth) return `${base} text-muted/40 hover:bg-white/5`;
  return `${base} text-foreground hover:bg-white/5`;
}
