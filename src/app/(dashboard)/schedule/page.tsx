"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { dayOrder, formatTime, formatTimeRange } from "@/lib/taskTime";
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
import {
  Bell,
  Building2,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  List,
  Plus,
  Repeat,
  User,
} from "lucide-react";
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
import { RecurrencePicker, RecurrenceIndicator } from "@/components/ui/RecurrencePicker";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/format";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { nextActivityPayload } from "@/lib/recurrence";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { packColumns } from "@/lib/calendarLayout";
import { Checkbox } from "@/components/ui/Checkbox";
import { HoverCard } from "@/components/ui/HoverCard";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/format";
import type { Activity, Client, Deal, Project, ProjectTask } from "@/lib/types";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { CATEGORICAL_HUES, hueFor } from "@/lib/palette";

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
  recurrence: "none",
  agenda: "",
  notes: "",
  attendee_ids: [],
  client_visible: false,
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Pixel height of one hour row in the week grid. */
const HOUR_HEIGHT = 56;
/** Default event duration (minutes) — activities only store a start time. */
const EVENT_MINUTES = 60;

/**
 * ONE palette, used by both the week grid and the month chips.
 *
 * These were two lists — a 4-colour one for the week and a 6-colour one for the
 * month — hashed with the same key but a different modulus, so a single event
 * came out pink in one view and blue in the other. Worse, the week grid didn't
 * look at `a.color` at all, so right-click → recolour in the month view
 * appeared to do nothing when you switched to Week.
 *
 * The list has since moved out to `lib/palette.ts`, because the project
 * timeline kept its own near-identical copy — four hues the same, two quietly
 * different — and the same project came out two shades of indigo depending on
 * which page you were on. Same class of bug as the one above, one level up.
 *
 * Why these stay hex rather than becoming CSS tokens is argued in that file:
 * both consumers do string arithmetic on the hue (`color-mix(in oklab,
 * ${hue} 16%, ...)`), and a user-chosen `activities.color` is an arbitrary
 * value no fixed token set can name.
 */
const EVENT_HUES = CATEGORICAL_HUES;

/** The single source of truth for "what colour is this event". */
function eventHue(a: Activity): string {
  // An explicit choice always wins over the automatic one.
  if (a.color) return a.color;
  return hueFor(a.client_id ?? a.id);
}

/**
 * Week-grid block: a wash, a saturated left edge, and text in the same hue.
 *
 * The label mixes toward BLACK. It mixed toward white while the app was dark —
 * a light tint on a dark block. On a pale block that same tint is invisible,
 * so the direction flips with the theme.
 */
function eventColor(a: Activity) {
  const hue = eventHue(a);
  return {
    bg: `color-mix(in oklab, ${hue} 16%, transparent)`,
    bar: hue,
    fg: `color-mix(in oklab, ${hue} 55%, black)`,
  };
}

/**
 * Assign overlapping events to side-by-side columns within a day.
 *
 * The packing itself lives in `lib/calendarLayout.ts` so it can be tested;
 * this is only the adapter that turns activities into minutes-since-midnight.
 */
function layoutDay(events: Activity[]) {
  const timed = events.map((a) => {
    const d = parseISO(a.activity_date);
    return { item: a, startMin: getHours(d) * 60 + getMinutes(d) };
  });
  return packColumns(timed, EVENT_MINUTES).map((p) => ({
    a: p.item,
    col: p.col,
    cols: p.cols,
    start: p.startMin,
  }));
}

export default function SchedulePage() {
  const { profile } = useAuth();
  const { rows: activities, setRows } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: profiles } = useStaffProfiles();
  const { rows: projectTasks, setRows: setTaskRows } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: projects, setRows: setProjectRows } = useSupabaseTable<Project>("projects");

  /* Opens on the calendar: a schedule is a shape in time, and the list is the
     view you switch to when you want to search or bulk-edit. */
  const [tab, setTab] = useState<Tab>("calendar");
  const [calView, setCalView] = useState<CalView>("week");
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [saving, setSaving] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.company ?? "—";
  const assigneeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";
  // Attendees are always real ids, so "Unassigned" would be a lie here.
  const personName = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? "Someone";

  // No cron: when a recurring schedule item's date has passed, spawn its next
  // occurrence once on load. nextActivityPayload de-dupes via parent id.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current || activities.length === 0) return;
    sweptRef.current = true;
    const now = new Date();
    const due = activities.filter(
      (a) => a.recurrence !== "none" && new Date(a.activity_date) < now
    );
    if (due.length === 0) return;
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      for (const a of due) {
        const payload = nextActivityPayload(a, activities, now);
        if (!payload) continue;
        const { data, error } = await supabase
          .from("activities")
          .insert(payload)
          .select()
          .single();
        if (!error && data) setRows((prev) => [data as Activity, ...prev]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  const filtered = useMemo(
    () => (tab === "mine" && profile ? activities.filter((a) => a.assigned_to === profile.id) : activities),
    [activities, tab, profile]
  );

  const { filters, views, setFilters, setViews } = useStoredFilters("schedule");

  const visible = useMemo(
    () =>
      applyFilters(filtered, filters, {
        text: (a) => [
          a.description,
          a.outcome,
          a.location,
          clients.find((c) => c.id === a.client_id)?.company,
        ],
        assignee: (a) => a.assigned_to,
        due: (a) => a.activity_date,
      }),
    [filtered, filters, clients]
  );

  const columns: Column<Activity>[] = [
    {
      header: "Description",
      icon: FileText,
      width: "30%",
      render: (a) => (
        /* The td's `truncate` can't clip a flex child, so the text needs its
           own truncate and min-w-0 — otherwise a long description pushes the
           recurrence icon out of the cell instead of ellipsising. */
        <span className="flex items-center gap-1.5 font-medium">
          <span className="min-w-0 truncate" title={a.description}>
            {a.description}
          </span>
          <RecurrenceIndicator recurrence={a.recurrence} />
        </span>
      ),
      sortKey: (a) => a.description.toLowerCase(),
    },
    {
      header: "Client",
      icon: Building2,
      width: "20%",
      render: (a) => clientName(a.client_id),
      sortKey: (a) =>
        a.client_id ? clientName(a.client_id).toLowerCase() : null,
    },
    {
      header: "Assigned To",
      icon: User,
      width: "170px",
      render: (a) => assigneeName(a.assigned_to),
      sortKey: (a) =>
        a.assigned_to ? assigneeName(a.assigned_to).toLowerCase() : null,
    },
    {
      header: "Date",
      icon: CalendarDays,
      width: "130px",
      render: (a) => formatDate(a.activity_date),
      sortKey: (a) => a.activity_date,
    },
    {
      header: "Follow-up",
      icon: Bell,
      width: "130px",
      render: (a) =>
        a.follow_up_required ? (
          <Badge tone="yellow" dot>Required</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortKey: (a) => (a.follow_up_required ? 0 : 1),
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
    const ok = await confirmAction({
      title: "Delete this schedule item?",
      confirmLabel: "Delete",
    });
    if (!ok) return;
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
    // Within a day: all-day work first, then by start time. Without this the
    // order is whatever the query returned, which makes a 9am and a 5pm task
    // read as unordered.
    for (const arr of map.values()) arr.sort((a, b) => dayOrder(a) - dayOrder(b));
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")} icon={List} label="All" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} icon={User} label="Mine" />
          <TabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={Calendar} label="Calendar" />
        </div>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>
          <Plus className="h-4 w-4" /> New Schedule Item
        </Button>
      </div>

      {tab !== "calendar" ? (
        <>
          <FilterBar
            filters={filters}
            onChange={setFilters}
            views={views}
            onViewsChange={setViews}
            assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
            showDue
            dueLabel="Date"
            placeholder="Filter schedule…"
          />
          <DataTable
            columns={columns}
            rows={visible}
            rowKey={(a) => a.id}
            onRowClick={setEditing}
            emptyMessage={
              filtered.length > 0
                ? "No items match the current filters."
                : "No schedule items yet."
            }
          />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              {format(anchor, "MMMM")}{" "}
              <span className="font-normal text-muted-foreground">{format(anchor, "yyyy")}</span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-border bg-surface">
                <button
                  onClick={goPrev}
                  className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-hover hover:text-foreground"
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
                  className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-hover hover:text-foreground"
                  aria-label="Next"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5">
                <button
                  onClick={() => setCalView("week")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    calView === "week" ? "bg-active text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalView("month")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    calView === "month" ? "bg-active text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
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
              personName={personName}
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
              <Label>Agenda</Label>
              <Textarea
                rows={3}
                placeholder="What are we covering?"
                value={editing.agenda ?? ""}
                onChange={(e) => setEditing({ ...editing, agenda: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                placeholder="What was decided, and what happens next..."
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            <div>
              <Label>Attendees</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-edge bg-raise p-2">
                {profiles.length === 0 && (
                  <span className="px-1 text-xs text-muted-foreground">No team members yet.</span>
                )}
                {profiles.map((p) => {
                  const selected = (editing.attendee_ids ?? []).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        const current = editing.attendee_ids ?? [];
                        setEditing({
                          ...editing,
                          attendee_ids: selected
                            ? current.filter((id) => id !== p.id)
                            : [...current, p.id],
                        });
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                        selected
                          ? "border-primary/40 bg-primary/15 text-foreground"
                          : "border-input text-muted-foreground hover:bg-hover"
                      )}
                    >
                      <Avatar name={p.full_name} url={p.avatar_url} size="xs" />
                      {p.full_name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Client</Label>
              <Dropdown
                value={editing.client_id ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...clients.map((c) => ({ value: c.id, label: c.company })),
                ]}
                onChange={(v) => setEditing({ ...editing, client_id: v || null })}
              />
            </div>
            <div>
              <Label>Deal</Label>
              <Dropdown
                value={editing.deal_id ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...deals.map((d) => ({ value: d.id, label: d.deal_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, deal_id: v || null })}
              />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Dropdown
                value={editing.assigned_to ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...profiles.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, assigned_to: v || null })}
              />
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
                <Dropdown
                  value={timePart(editing.activity_date)}
                  options={timeOptions(timePart(editing.activity_date)).map((t) => ({
                    value: t,
                    label: formatTimeLabel(t),
                  }))}
                  onChange={(v) =>
                    setEditing({
                      ...editing,
                      activity_date: `${datePart(editing.activity_date) ?? format(new Date(), "yyyy-MM-dd")}T${v}`,
                    })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Repeat</Label>
              <RecurrencePicker
                value={editing.recurrence ?? "none"}
                onChange={(recurrence) => setEditing({ ...editing, recurrence })}
              />
              {editing.recurrence && editing.recurrence !== "none" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The next occurrence is created automatically once this date passes.
                </p>
              )}
            </div>
            <Checkbox
              className="text-sm"
              checked={!!editing.follow_up_required}
              onChange={(follow_up_required) => setEditing({ ...editing, follow_up_required })}
              label="Follow-up required"
            />
            <Checkbox
              align="start"
              className="text-sm"
              checked={!!editing.client_visible}
              onChange={(client_visible) => setEditing({ ...editing, client_visible })}
              label={
                <span>
                  Show in the client portal
                  <span className="block text-xs text-muted-foreground">
                    The client sees the date, agenda and attendees. Notes stay internal.
                  </span>
                </span>
              }
            />
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
  personName,
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
  personName: (id: string) => string;
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
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
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
                  className="truncate rounded-md border border-danger/40 bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--danger-fg)]"
                >
                  ◆ {p.name}
                </Link>
              ))}
              {dts.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${t.project_id}`}
                  title={`${t.name} — ${projectName(t.project_id)}${
                    formatTimeRange(t.due_time, t.end_time)
                      ? ` · ${formatTimeRange(t.due_time, t.end_time)}`
                      : ""
                  }`}
                  className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: "var(--event-indigo-bg)",
                    color: "var(--event-indigo-fg)",
                    boxShadow: "inset 3px 0 0 0 var(--event-indigo-bar)",
                  }}
                >
                  {/* Time leads the label, the way it does in every calendar —
                      it's what you scan for. All-day tasks just show the name. */}
                  {t.due_time && (
                    <span className="mr-1 opacity-80 tabular-nums">{formatTime(t.due_time)}</span>
                  )}
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
                    personName={personName}
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

/**
 * What you get on hover: enough to decide whether to open the thing.
 *
 * Deliberately not the whole record — notes are internal and long, and a
 * preview that needs scrolling has failed at being a preview.
 */
function EventPreview({
  a,
  clientName,
  personName,
}: {
  a: Activity;
  clientName: (id: string | null) => string;
  personName: (id: string) => string;
}) {
  const d = parseISO(a.activity_date);
  const attendees = a.attendee_ids ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-[13px] font-semibold leading-snug text-foreground">
          {a.description}
        </p>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
          {format(d, "EEE d MMM")} · {format(d, "H:mm")}
          {a.location ? ` · ${a.location}` : ""}
        </p>
      </div>

      {a.client_id && (
        <div className="flex items-center gap-1.5 text-[11px] text-foreground-secondary">
          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{clientName(a.client_id)}</span>
        </div>
      )}

      {attendees.length > 0 && (
        <div className="flex items-start gap-1.5 text-[11px] text-foreground-secondary">
          <User className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground" />
          {/* Names, not avatars — at this size initials are a guessing game. */}
          <span className="min-w-0">
            {attendees.slice(0, 4).map(personName).join(", ")}
            {attendees.length > 4 && ` +${attendees.length - 4} more`}
          </span>
        </div>
      )}

      {a.agenda?.trim() && (
        <div className="border-t border-border-subtle pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
            Agenda
          </p>
          <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-foreground-secondary">
            {a.agenda.trim()}
          </p>
        </div>
      )}
    </div>
  );
}

function WeekEvent({
  a,
  col,
  cols,
  clientName,
  personName,
  onClick,
}: {
  a: Activity;
  col: number;
  cols: number;
  clientName: (id: string | null) => string;
  personName: (id: string) => string;
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
    <HoverCard
      // Forced shut mid-drag: a preview card chasing the block you're moving
      // is noise, and it sits under the cursor you're dragging with.
      open={isDragging ? false : undefined}
      trigger={
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-event
      onClick={onClick}
      className={cn(
        // brightness() on a translucent dark fill is almost invisible — the
        // block is mostly the grid showing through. A white-alpha overlay is
        // the app's standard hover anyway (see design.md), so use that.
        "group/ev absolute overflow-hidden rounded-md px-1.5 py-1 text-left transition-[box-shadow,background-color] duration-150 hover:shadow-md hover:",
        "after:pointer-events-none after:absolute after:inset-0 after:bg-white/0 after:transition-colors hover:after:bg-hover",
        isDragging && "z-30 shadow-[var(--shadow-xl)] after:bg-active"
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
      <p
        className="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight"
        style={{ color: color.fg }}
      >
        <span className="truncate">
          {format(d, "H:mm")} <span className="font-medium">{a.description}</span>
        </span>
        {a.recurrence !== "none" && <Repeat className="h-2.5 w-2.5 shrink-0 opacity-70" />}
      </p>
      {/* The client line is secondary, so it's the same hue at lower opacity
          rather than a second colour competing inside a 22px-tall block. */}
      <p className="truncate text-[10px] leading-tight opacity-65" style={{ color: color.fg }}>
        {clientName(a.client_id)}
      </p>
    </button>
      }
    >
      <EventPreview a={a} clientName={clientName} personName={personName} />
    </HoverCard>
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

/** The recolour swatches. Same list the automatic hue is drawn from, so
 *  "pick the colour it already is" is actually available. */
const CHIP_COLORS = EVENT_HUES;

/** Month chip and week block must agree — both go through `eventHue`. */
const chipColor = eventHue;

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
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
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
                      recurring={a.recurrence !== "none"}
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
                      title={t.due_time ? `${formatTime(t.due_time)} ${t.name}` : t.name}
                      hint={projectName(t.project_id)}
                      past={false}
                      recurring={t.recurrence !== "none"}
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
          className="fixed inset-0 z-[var(--z-scrim)]"
          onClick={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="animate-pop absolute rounded-md border border-border bg-surface p-2.5 shadow-[var(--shadow-xl)]"
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
  recurring = false,
  onClick,
  onContextMenu,
}: {
  drag: MonthDrag;
  color: string;
  title: string;
  hint?: string;
  past: boolean;
  recurring?: boolean;
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
        isDragging && "z-30 opacity-90 shadow-[var(--shadow-lg)]"
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
      <span className="flex min-w-0 items-center gap-1 truncate">
        {recurring && <Repeat className="h-2.5 w-2.5 shrink-0 opacity-80" />}
        <span className="truncate">{title}</span>
      </span>
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
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
        active ? "bg-active text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
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

