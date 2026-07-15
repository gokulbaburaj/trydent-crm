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
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn, withViewTransition } from "@/lib/utils";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
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
  const { rows: projectTasks, setRows: setTaskRows } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: projects, setRows: setProjectRows } = useSupabaseTable<Project>("projects");

  const [tab, setTab] = useState<Tab>("all");
  const [calView, setCalView] = useState<CalView>("week");
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [saving, setSaving] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());

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
          <span className="text-muted-foreground">—</span>
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

  const projectsByDay = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      if (!p.due_date) continue;
      const key = p.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [projects]);

  const dayProjects = (day: Date) => projectsByDay.get(format(day, "yyyy-MM-dd")) ?? [];

  /* ---- drag-to-reschedule + recolor handlers ---- */

  async function moveActivity(a: Activity, newIso: string) {
    setRows((prev) => prev.map((x) => (x.id === a.id ? { ...x, activity_date: newIso } : x)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("activities").update({ activity_date: newIso }).eq("id", a.id);
  }

  async function moveTaskDue(id: string, day: string) {
    setTaskRows((prev) => prev.map((t) => (t.id === id ? { ...t, due_date: day } : t)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("project_tasks").update({ due_date: day }).eq("id", id);
  }

  async function moveProjectDue(id: string, day: string) {
    setProjectRows((prev) => prev.map((p) => (p.id === id ? { ...p, due_date: day } : p)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("projects").update({ due_date: day }).eq("id", id);
  }

  async function recolorActivity(id: string, color: string | null) {
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("activities").update({ color }).eq("id", id);
  }

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
              <span className="font-normal text-muted-foreground">{format(anchor, "yyyy")}</span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded border border-border bg-surface">
                <button
                  onClick={goPrev}
                  className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setAnchor(new Date())}
                  className="px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Today
                </button>
                <button
                  onClick={goNext}
                  className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-0.5 rounded border border-border bg-surface p-0.5">
                <button
                  onClick={() => setCalView("week")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    calView === "week" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalView("month")}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    calView === "month" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
          </div>

          <div key={calView} className="animate-fade">
          {calView === "week" ? (
            <WeekGrid
              anchor={anchor}
              dayEvents={dayEvents}
              dayTasks={dayTasks}
              dayProjects={dayProjects}
              projectName={projectName}
              clientName={clientName}
              onEventClick={setEditing}
              onEventMove={moveActivity}
              onSlotClick={(dt) =>
                setEditing({ ...emptyForm, activity_date: format(dt, "yyyy-MM-dd'T'HH:mm") })
              }
            />
          ) : (
            <MonthGridPro
              anchor={anchor}
              dayEvents={dayEvents}
              dayTasks={dayTasks}
              dayProjects={dayProjects}
              projectName={projectName}
              onEventClick={setEditing}
              onMoveActivity={(a, day) =>
                moveActivity(a, `${day}T${format(parseISO(a.activity_date), "HH:mm")}`)
              }
              onMoveTask={moveTaskDue}
              onMoveProject={moveProjectDue}
              onRecolor={recolorActivity}
            />
          )}
          </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <DatePicker
                  value={datePart(editing.activity_date)}
                  onChange={(d) =>
                    setEditing({
                      ...editing,
                      activity_date: `${d ?? format(new Date(), "yyyy-MM-dd")}T${timePart(editing.activity_date)}`,
                    })
                  }
                />
              </div>
              <div>
                <Label>Time</Label>
                <Select
                  value={timePart(editing.activity_date)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      activity_date: `${datePart(editing.activity_date) ?? format(new Date(), "yyyy-MM-dd")}T${e.target.value}`,
                    })
                  }
                >
                  {timeOptions(timePart(editing.activity_date)).map((t) => (
                    <option key={t} value={t}>{formatTimeLabel(t)}</option>
                  ))}
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.follow_up_required}
                onChange={(e) => setEditing({ ...editing, follow_up_required: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
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
  dayProjects,
  projectName,
  clientName,
  onEventClick,
  onEventMove,
  onSlotClick,
}: {
  anchor: Date;
  dayEvents: (day: Date) => Activity[];
  dayTasks: (day: Date) => ProjectTask[];
  dayProjects: (day: Date) => Project[];
  projectName: (id: string) => string;
  clientName: (id: string | null) => string;
  onEventClick: (a: Activity) => void;
  onEventMove: (a: Activity, newIso: string) => void;
  onSlotClick: (dt: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const days = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: endOfWeek(anchor, { weekStartsOn: 1 }) });
  }, [anchor]);

  useEffect(() => {
    // Open the grid at 8:00 so the workday is in view.
    scrollRef.current?.scrollTo({ top: 8 * HOUR_HEIGHT });
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over, delta } = e;
    if (!over) return;
    const a = active.data.current?.activity as Activity | undefined;
    if (!a) return;
    const day = String(over.id).replace("wday:", "");
    const orig = parseISO(a.activity_date);
    // Snap the vertical drag to 30-minute steps, clamped to the day.
    const shift = Math.round(((delta.y / HOUR_HEIGHT) * 60) / 30) * 30;
    const total = Math.min(
      Math.max(getHours(orig) * 60 + getMinutes(orig) + shift, 0),
      23 * 60 + 30
    );
    const hh = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    withViewTransition(() => onEventMove(a, `${day}T${hh}`));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <div className="min-w-[680px]">
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
            <span className={isToday(day) ? "font-medium text-foreground" : "text-muted-foreground"}>
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

      {/* All-day row: project tasks + project deadlines that day */}
      <div className="grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-border">
        <div className="flex items-center justify-end pr-2 text-[10px] text-muted-2">tasks</div>
        {days.map((day) => {
          const dts = dayTasks(day);
          const dps = dayProjects(day);
          return (
            <div
              key={day.toISOString()}
              className="flex min-h-7 flex-col gap-0.5 border-l border-border-subtle p-0.5"
            >
              {dps.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  title={`${p.name} — project deadline`}
                  className="truncate rounded border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger"
                >
                  ◆ {p.name}
                </Link>
              ))}
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
                <span className="px-1.5 text-[10px] text-muted-foreground">+{dts.length - 3} more</span>
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
              <WeekDayColumn key={day.toISOString()} day={day} onSlotClick={onSlotClick}>
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
                {placed.map(({ a, col, cols }) => (
                  <WeekEvent
                    key={a.id}
                    a={a}
                    col={col}
                    cols={cols}
                    clientName={clientName}
                    onClick={() => onEventClick(a)}
                  />
                ))}
              </WeekDayColumn>
            );
          })}
        </div>
      </div>
      </div>
    </div>
    </DndContext>
  );
}

function WeekDayColumn({
  day,
  onSlotClick,
  children,
}: {
  day: Date;
  onSlotClick: (dt: Date) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `wday:${format(day, "yyyy-MM-dd")}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-l border-border-subtle transition-colors",
        isOver && "bg-primary/5"
      )}
      style={{ height: 24 * HOUR_HEIGHT }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-event]")) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const hour = Math.floor((e.clientY - rect.top) / HOUR_HEIGHT);
        onSlotClick(setHours(day, hour));
      }}
    >
      {children}
    </div>
  );
}

function WeekEvent({
  a,
  col,
  cols,
  clientName,
  onClick,
}: {
  a: Activity;
  col: number;
  cols: number;
  clientName: (id: string | null) => string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `act:${a.id}`,
    data: { activity: a },
  });
  const d = parseISO(a.activity_date);
  const top = (getHours(d) + getMinutes(d) / 60) * HOUR_HEIGHT;
  const color = eventColor(a);
  const width = 100 / cols;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-event
      onClick={onClick}
      className={cn(
        "absolute overflow-hidden rounded px-1.5 py-1 text-left transition-[filter,box-shadow] duration-150 hover:brightness-105 hover:shadow-md hover:shadow-black/20",
        isDragging && "z-30 opacity-90 shadow-xl shadow-black/50 brightness-110"
      )}
      style={{
        top: top + 1,
        height: (EVENT_MINUTES / 60) * HOUR_HEIGHT - 2,
        left: `calc(${col * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        background: color.bg,
        boxShadow: `inset 3px 0 0 0 ${color.bar}`,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
    >
      <p className="truncate text-[11px] font-semibold leading-tight text-[#16171b]">
        {format(d, "H:mm")} <span className="font-medium">{a.description}</span>
      </p>
      <p className="truncate text-[10px] leading-tight text-[#16171b]/70">
        {clientName(a.client_id)}
      </p>
    </button>
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

const CHIP_COLORS = ["#eb5757", "#d9a53f", "#4cb782", "#4ea7e0", "#a855f7", "#d95c8a"];

function chipColor(a: Activity) {
  if (a.color) return a.color;
  const key = a.client_id ?? a.id;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CHIP_COLORS[Math.abs(hash) % CHIP_COLORS.length];
}

interface MonthDrag {
  kind: "act" | "task" | "proj";
  id: string;
  activity?: Activity;
}

function MonthGridPro({
  anchor,
  dayEvents,
  dayTasks,
  dayProjects,
  projectName,
  onEventClick,
  onMoveActivity,
  onMoveTask,
  onMoveProject,
  onRecolor,
}: {
  anchor: Date;
  dayEvents: (day: Date) => Activity[];
  dayTasks: (day: Date) => ProjectTask[];
  dayProjects: (day: Date) => Project[];
  projectName: (id: string) => string;
  onEventClick: (a: Activity) => void;
  onMoveActivity: (a: Activity, day: string) => void;
  onMoveTask: (id: string, day: string) => void;
  onMoveProject: (id: string, day: string) => void;
  onRecolor: (id: string, color: string | null) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; color: string | null } | null>(null);

  const monthGrid = useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [anchor]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const day = String(over.id).replace("mday:", "");
    const data = active.data.current as MonthDrag | undefined;
    if (!data) return;
    // Morph the chip into its new day instead of teleporting.
    withViewTransition(() => {
      if (data.kind === "act" && data.activity) onMoveActivity(data.activity, day);
      if (data.kind === "task") onMoveTask(data.id, day);
      if (data.kind === "proj") onMoveProject(data.id, day);
    });
  }

  const now = new Date();

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto rounded border border-border bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-border text-center">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2 text-[11px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.map((day) => {
              const inMonth = isSameMonth(day, anchor);
              const events = dayEvents(day);
              const tasks = dayTasks(day);
              const projects = dayProjects(day);
              const extra = Math.max(events.length + tasks.length + projects.length - 3, 0);
              return (
                <MonthDayCell key={day.toISOString()} day={day} inMonth={inMonth}>
                  {projects.slice(0, 1).map((p) => (
                    <MonthChip
                      key={p.id}
                      drag={{ kind: "proj", id: p.id }}
                      color="#eb5757"
                      title={`◆ ${p.name}`}
                      hint="due"
                      past={false}
                      onClick={() => {}}
                    />
                  ))}
                  {events.slice(0, 2).map((a) => (
                    <MonthChip
                      key={a.id}
                      drag={{ kind: "act", id: a.id, activity: a }}
                      color={chipColor(a)}
                      title={a.description}
                      hint={format(parseISO(a.activity_date), "h:mm a")}
                      past={parseISO(a.activity_date) < now}
                      onClick={() => onEventClick(a)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ x: e.clientX, y: e.clientY, id: a.id, color: a.color });
                      }}
                    />
                  ))}
                  {tasks.slice(0, 1).map((t) => (
                    <MonthChip
                      key={t.id}
                      drag={{ kind: "task", id: t.id }}
                      color="#6c74dd"
                      title={t.name}
                      hint={projectName(t.project_id)}
                      past={false}
                      onClick={() => {}}
                    />
                  ))}
                  {extra > 0 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{extra} more</span>
                  )}
                </MonthDayCell>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right-click color menu */}
      {menu && (
        <div
          className="fixed inset-0 z-[140]"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="animate-pop absolute rounded-md border border-border bg-surface p-2.5 shadow-xl shadow-black/60"
            style={{ top: Math.min(menu.y, window.innerHeight - 90), left: Math.min(menu.x, window.innerWidth - 220) }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">Event color</p>
            <div className="flex items-center gap-1.5">
              {CHIP_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onRecolor(menu.id, c);
                    setMenu(null);
                  }}
                  className={cn(
                    "h-5 w-5 rounded-full transition-transform hover:scale-110",
                    menu.color === c && "ring-2 ring-white/60 ring-offset-1 ring-offset-surface"
                  )}
                  style={{ background: c }}
                />
              ))}
              <button
                title="Auto (by client)"
                onClick={() => {
                  onRecolor(menu.id, null);
                  setMenu(null);
                }}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[9px] font-medium text-muted-foreground hover:text-foreground"
              >
                A
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}

function MonthDayCell({
  day,
  inMonth,
  children,
}: {
  day: Date;
  inMonth: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `mday:${format(day, "yyyy-MM-dd")}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[104px] flex-col gap-1 border-b border-r border-border-subtle p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
        !inMonth && "opacity-40",
        isOver && "bg-primary/10"
      )}
    >
      <span
        className={cn(
          "self-end text-xs",
          isToday(day)
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground"
            : "px-1 text-muted-foreground"
        )}
      >
        {format(day, "d")}
      </span>
      {children}
    </div>
  );
}

function MonthChip({
  drag,
  color,
  title,
  hint,
  past,
  onClick,
  onContextMenu,
}: {
  drag: MonthDrag;
  color: string;
  title: string;
  hint?: string;
  past: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${drag.kind}:${drag.id}`,
    data: drag,
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "flex items-center justify-between gap-1 rounded-md border px-1.5 py-0.5 text-left text-[11px] font-medium transition-[filter] hover:brightness-125",
        past && "line-through opacity-45",
        isDragging && "z-30 opacity-90 shadow-lg shadow-black/50"
      )}
      style={
        {
          borderColor: `${color}55`,
          color,
          background: `${color}14`,
          transform: transform
            ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
            : undefined,
          viewTransitionName: isDragging ? undefined : `chip-${drag.kind}-${drag.id}`,
        } as React.CSSProperties
      }
    >
      <span className="min-w-0 truncate">{title}</span>
      {hint && <span className="shrink-0 text-[10px] opacity-75">{hint}</span>}
    </button>
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
        active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/* -------- datetime helpers for the form -------- */

function datePart(value: string | null | undefined): string | null {
  if (!value) return null;
  return format(new Date(value), "yyyy-MM-dd");
}

function timePart(value: string | null | undefined): string {
  if (!value) return "09:00";
  return format(new Date(value), "HH:mm");
}

function timeOptions(current: string): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of ["00", "30"]) {
      opts.push(`${String(h).padStart(2, "0")}:${m}`);
    }
  }
  if (!opts.includes(current)) opts.push(current);
  return opts.sort();
}

function formatTimeLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

