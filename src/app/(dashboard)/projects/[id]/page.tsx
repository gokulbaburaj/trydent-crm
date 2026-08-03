"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  Box,
  Building2,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  MoreHorizontal,
  PhoneCall,
  Plus,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { BulkActionBar } from "@/components/BulkActionBar";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { DashGrid } from "@/components/DashGrid";
import { ProjectPageSkeleton } from "@/components/ui/Skeletons";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatTimeRange } from "@/lib/taskTime";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { useMultiSelect } from "@/lib/useMultiSelect";
import { nextTaskPayload } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate, initials } from "@/lib/format";
import { useCurrency } from "@/lib/currency";
import { useTabs } from "@/lib/tabs";
import type { Activity, Client, Deal, Project, ProjectTask, TaskItem, TaskPriority, TaskStatus } from "@/lib/types";
import { PRIORITY_ORDER, PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";
import { useViewPreference } from "@/lib/useViewPreference";
import { PriorityFlag } from "@/components/ui/PriorityPicker";
import { RecurrenceIndicator } from "@/components/ui/RecurrencePicker";

/** True when a yyyy-MM-dd string is today's date. */
function isSameDayAsToday(date: string | null | undefined) {
  if (!date) return false;
  return date.slice(0, 10) === format(new Date(), "yyyy-MM-dd");
}

type PageTab = "overview" | "tasks" | "board" | "calendar";

const BOARD_STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Done"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { setTitle } = useTabs();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [tab, setTab] = useViewPreference<PageTab>("project", "overview");
  const [newTask, setNewTask] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const {
    rows: allTasks,
    setRows: setTasks,
    error: tasksError,
  } = useSupabaseTable<ProjectTask>("project_tasks", {
    column: "created_at",
    ascending: true,
  });
  const { rows: clients, setRows: setClients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { format: formatCurrency } = useCurrency();
  const { rows: profiles } = useStaffProfiles();
  const { rows: activities, setRows: setActivityRows } = useSupabaseTable<Activity>("activities");
  const { rows: allSubtasks } = useSupabaseTable<TaskItem>("task_items");

  const subtaskStats = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const s of allSubtasks) {
      const cur = map.get(s.task_id) ?? { done: 0, total: 0 };
      cur.total += 1;
      if (s.status === "Done") cur.done += 1;
      map.set(s.task_id, cur);
    }
    return map;
  }, [allSubtasks]);

  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.project_id === projectId)
        .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
    [allTasks, projectId]
  );

  // Shared across all project pages so saved views work anywhere.
  const { filters, views, setFilters, setViews } = useStoredFilters("project-tasks");

  /** Hovering a task anywhere on the Overview highlights it everywhere else —
   *  the same row of data lives in three widgets and it's otherwise hard to
   *  tell which bar or date belongs to which task. */
  const [hoverTask, setHoverTask] = useState<string | null>(null);

  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [meetingTime, setMeetingTime] = useState("10:00");
  const [meetingAgenda, setMeetingAgenda] = useState("");
  const [meetingAttendees, setMeetingAttendees] = useState<string[]>([]);
  const [meetingVisible, setMeetingVisible] = useState(false);
  const [meetingBusy, setMeetingBusy] = useState(false);
  /** Set while editing an existing meeting; null means the form creates one. */
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  /** Open the form blank, for a new meeting. */
  function newMeeting() {
    setEditingMeetingId(null);
    setMeetingTitle("");
    setMeetingDate(format(new Date(), "yyyy-MM-dd"));
    setMeetingTime("10:00");
    setMeetingAgenda("");
    setMeetingAttendees([]);
    setMeetingVisible(false);
    setMeetingOpen(true);
  }

  /**
   * Open the form on an existing meeting.
   *
   * The rows used to be inert divs — the card could schedule a meeting and then
   * had no way to change or cancel one, which meant a typo in a client call
   * lived forever. Same form, prefilled, saving by id.
   */
  function openMeeting(a: Activity) {
    const at = parseISO(a.activity_date);
    setEditingMeetingId(a.id);
    setMeetingTitle(a.description ?? "");
    setMeetingDate(format(at, "yyyy-MM-dd"));
    setMeetingTime(format(at, "HH:mm"));
    setMeetingAgenda(a.agenda ?? "");
    setMeetingAttendees(a.attendee_ids ?? []);
    setMeetingVisible(!!a.client_visible);
    setMeetingOpen(true);
  }

  async function deleteMeeting() {
    if (!editingMeetingId) return;
    if (!confirm("Cancel this meeting?")) return;
    const id = editingMeetingId;
    setActivityRows((prev) => prev.filter((a) => a.id !== id));
    setMeetingOpen(false);
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) toast.error(`Couldn't cancel: ${error.message}`);
    else toast.success("Meeting cancelled");
  }

  /** Resolved member profiles, in the order they were added. */
  const projectMembers = useMemo(
    () =>
      (project?.member_ids ?? [])
        .map((id) => profiles.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p),
    [project, profiles]
  );

  const taskLabels = useMemo(
    () =>
      Array.from(
        new Set(tasks.map((t) => t.label).filter((l): l is string => !!l))
      ).sort(),
    [tasks]
  );

  const visibleTasks = useMemo(
    () =>
      applyFilters(tasks, filters, {
        text: (t) => [t.name, t.description],
        status: (t) => t.status,
        assignee: (t) => t.assigned_to,
        labels: (t) => (t.label ? [t.label] : []),
        priority: (t) => t.priority,
        due: (t) => t.due_date,
      }),
    [tasks, filters]
  );

  const visibleActive = useMemo(
    () => visibleTasks.filter((t) => t.status !== "Archived"),
    [visibleTasks]
  );

  const { selected, toggle, setMany, clear } = useMultiSelect();

  /**
   * Task columns for the List tab.
   *
   * The same shape as Projects, Clients and Pipeline — icons in the headers,
   * click-to-sort, fixed widths — so the four tables in the app read as one
   * component rather than four opinions. Everything that used to be a bespoke
   * row (inline status, inline due date, the row menu) is now a cell.
   */
  const taskColumns: Column<ProjectTask>[] = [
    {
      header: "Status",
      icon: CircleDot,
      width: "150px",
      sortKey: (t) => TASK_STATUSES.indexOf(t.status),
      render: (t) => (
        <span onClick={(e) => e.stopPropagation()}>
          <StatusPicker
            value={t.status}
            options={TASK_STATUSES}
            onChange={(status) => updateTask(t.id, { status })}
          />
        </span>
      ),
    },
    {
      header: "Task",
      icon: ListChecks,
      sortKey: (t) => t.name.toLowerCase(),
      render: (t) => (
        <button
          onClick={() => setDetailTaskId(t.id)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "min-w-0 truncate text-sm hover:underline",
              (t.status === "Done" || t.status === "Archived") &&
                "text-muted-foreground line-through decoration-muted-2"
            )}
            title={t.name}
          >
            {t.name}
          </span>
          <PriorityFlag priority={t.priority} />
          <RecurrenceIndicator recurrence={t.recurrence} />
          {t.approved_at && (
            <span title="Approved by client">
              <CheckCheck className="h-3.5 w-3.5 shrink-0 text-success" />
            </span>
          )}
          {t.label && <LabelChip label={t.label} />}
          {Array.isArray(t.links) && t.links.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Link2 className="h-3 w-3" /> {t.links.length}
            </span>
          )}
        </button>
      ),
    },
    {
      header: "Assignee",
      icon: User,
      width: "170px",
      // Unassigned sorts last rather than first — an empty assignee isn't a
      // name that begins with a space.
      sortKey: (t) => (t.assigned_to ? personName(t.assigned_to)?.toLowerCase() ?? "" : null),
      render: (t) =>
        t.assigned_to ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
              {initials(personName(t.assigned_to))}
            </span>
            <span className="truncate text-[12.5px] text-muted-foreground">
              {personName(t.assigned_to)}
            </span>
          </span>
        ) : (
          <span className="text-muted-2">Unassigned</span>
        ),
    },
    {
      header: "Due",
      icon: CalendarDays,
      width: "180px",
      // Undated last, not first — an empty date isn't the dawn of time. The
      // time is appended so two tasks on the same day sort by when they start.
      sortKey: (t) =>
        t.due_date ? `${t.due_date}T${t.due_time ?? "00:00:00"}` : "9999-12-31",
      render: (t) => (
        <span onClick={(e) => e.stopPropagation()} className="flex flex-col gap-0.5">
          <DatePicker
            align="right"
            value={t.due_date}
            placeholder="Due date"
            onChange={(d) =>
              updateTask(
                t.id,
                // Clearing the day has to clear the clock times with it — the
                // check constraint would otherwise be satisfied by a time that
                // belongs to no date.
                d ? { due_date: d } : { due_date: null, due_time: null, end_time: null }
              )
            }
          />
          {/* Read-only here: setting a time is a considered act and belongs in
              the drawer, but hiding it from the table would mean the schedule
              knows something this view doesn't. */}
          {formatTimeRange(t.due_time, t.end_time) && (
            <span className="pl-1 text-[11px] tabular-nums text-muted-foreground">
              {formatTimeRange(t.due_time, t.end_time)}
            </span>
          )}
        </span>
      ),
    },
    {
      header: "",
      width: "56px",
      className: "text-right",
      render: (t) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popover
            align="right"
            trigger={
              <button className="rounded p-1 text-muted-foreground opacity-0 hover:bg-white/5 hover:text-foreground group-hover:opacity-100">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Assign to</MenuLabel>
                <MenuItem
                  selected={!t.assigned_to}
                  onClick={() => {
                    updateTask(t.id, { assigned_to: null });
                    close();
                  }}
                >
                  Unassigned
                </MenuItem>
                {profiles.map((pr) => (
                  <MenuItem
                    key={pr.id}
                    selected={t.assigned_to === pr.id}
                    onClick={() => {
                      updateTask(t.id, { assigned_to: pr.id });
                      close();
                    }}
                  >
                    {pr.full_name}
                  </MenuItem>
                ))}
                <MenuItem
                  danger
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close();
                    deleteTask(t.id);
                  }}
                >
                  Delete task
                </MenuItem>
              </>
            )}
          </Popover>
        </span>
      ),
    },
  ];


  // Bulk actions only touch rows that are both selected and currently visible.
  const selectedIds = useMemo(
    () => visibleTasks.map((t) => t.id).filter((id) => selected.has(id)),
    [visibleTasks, selected]
  );

  async function bulkUpdateTasks(patch: Partial<ProjectTask>, what: string) {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, ...patch } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_tasks").update(patch).in("id", ids);
    if (error) toast.error(`Couldn't update: ${error.message}`);
    else toast.success(`${what} set for ${ids.length} task${ids.length !== 1 ? "s" : ""}`);
  }

  async function bulkDeleteTasks() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} task${ids.length !== 1 ? "s" : ""}?`)) return;
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));
    clear();
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_tasks").delete().in("id", ids);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    else toast.success(`Deleted ${ids.length} task${ids.length !== 1 ? "s" : ""}`);
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).single();
      const p = (data as Project) ?? null;
      setProject(p);
      setDescription(p?.description ?? "");
      if (p) setTitle(pathname, p.name);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.company ?? "—";
  const projectClient = clients.find((c) => c.id === project?.client_id) ?? null;

  /** The deal this project came out of, if it was created from one. */
  const projectDeal = deals.find((d) => d.id === project?.deal_id) ?? null;

  /**
   * Logs contact against the CLIENT record, not the project — there's one
   * `clients.last_contact` field, so stamping it here is the same fact the
   * client page shows. No duplicate state, nothing to reconcile.
   */
  async function markContacted() {
    if (!projectClient) return;
    const today = format(new Date(), "yyyy-MM-dd");
    setClients((prev) =>
      prev.map((c) => (c.id === projectClient.id ? { ...c, last_contact: today } : c))
    );
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("clients")
      .update({ last_contact: today })
      .eq("id", projectClient.id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
    else toast.success(`Logged contact with ${projectClient.company}`);
  }
  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? null;

  const active = tasks.filter((t) => t.status !== "Archived");
  const done = active.filter((t) => t.status === "Done");
  const inProgress = active.filter((t) => t.status === "In Progress");
  const notStarted = active.filter((t) => t.status === "Not Started");
  const completion = active.length > 0 ? Math.round((done.length / active.length) * 100) : 0;

  /** Everything on the calendar for this client, past and future. */
  const clientMeetings = useMemo(
    () => (project ? activities.filter((a) => a.client_id === project.client_id) : []),
    [activities, project]
  );

  const upcomingSchedule = useMemo(() => {
    const now = new Date();
    return clientMeetings
      .filter((a) => parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 4);
  }, [clientMeetings]);

  /** Schedule a meeting without leaving the project. Attendees default to the
   *  project team, which is the whole point of having one. */
  async function createMeeting() {
    const description = meetingTitle.trim();
    if (!description || !project) return;
    setMeetingBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setMeetingBusy(false);
      return;
    }
    const fields = {
      description,
      activity_date: `${meetingDate}T${meetingTime}`,
      agenda: meetingAgenda.trim() || null,
      attendee_ids: meetingAttendees,
      client_visible: meetingVisible,
    };

    // Editing keeps the same row so anything already pointing at this meeting
    // (the calendar, the client's portal) follows the change instead of seeing
    // a cancellation and a new booking.
    const { data, error } = editingMeetingId
      ? await supabase
          .from("activities")
          .update(fields)
          .eq("id", editingMeetingId)
          .select()
          .single()
      : await supabase
          .from("activities")
          .insert({
            ...fields,
            client_id: project.client_id,
            assigned_to: project.owner,
            recurrence: "none",
            follow_up_required: false,
          })
          .select()
          .single();

    setMeetingBusy(false);
    if (error || !data) {
      toast.error(`Couldn't save: ${error?.message ?? "unknown error"}`);
      return;
    }
    const saved = data as Activity;
    setActivityRows((prev) =>
      editingMeetingId ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev]
    );
    setMeetingOpen(false);
    setMeetingTitle("");
    setMeetingAgenda("");
    toast.success(editingMeetingId ? "Meeting updated" : "Meeting scheduled");
    setEditingMeetingId(null);
  }

  const migrationMissing =
    !!tasksError &&
    (tasksError.includes("does not exist") ||
      tasksError.includes("relation") ||
      tasksError.includes("schema cache"));

  async function updateProject(patch: Partial<Project>) {
    if (!project) return;
    setProject({ ...project, ...patch });
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("projects").update(patch).eq("id", project.id);
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm("Delete this project and all its tasks?")) return;
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("projects").delete().eq("id", project.id);
    router.push("/projects");
  }

  async function addTask(e?: React.FormEvent) {
    e?.preventDefault();
    const name = newTask.trim();
    if (!name) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_tasks")
      .insert({ project_id: projectId, name, status: "Not Started", sort_order: tasks.length })
      .select()
      .single();
    if (error) {
      setActionError(`Couldn't add task: ${error.message}`);
      return;
    }
    setActionError(null);
    setNewTask("");
    if (data) setTasks((prev) => [...prev, data as ProjectTask]);
  }

  async function updateTask(id: string, patch: Partial<ProjectTask>) {
    const before = allTasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_tasks").update(patch).eq("id", id);
    if (error) {
      setActionError(`Couldn't update task: ${error.message}`);
      return;
    }
    // A recurring task marked Done spawns its next occurrence.
    if (
      before &&
      before.recurrence !== "none" &&
      before.status !== "Done" &&
      patch.status === "Done"
    ) {
      await spawnNext({ ...before, ...patch });
    }
  }

  /** Insert the next occurrence of a recurring task, if one is due. */
  async function spawnNext(task: ProjectTask) {
    const payload = nextTaskPayload(task, allTasks);
    if (!payload) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_tasks")
      .insert(payload)
      .select()
      .single();
    if (!error && data) {
      setTasks((prev) => [...prev, data as ProjectTask]);
      toast.success("Next occurrence scheduled");
    }
  }

  /** Skip a recurring occurrence: schedule the next, remove this one. */
  async function skipTask(task: ProjectTask) {
    await spawnNext(task);
    await deleteTask(task.id);
    toast.success("Occurrence skipped");
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("project_tasks").delete().eq("id", id);
  }

  /** Quick-add from the project calendar: a task due that day, or a meeting at 10:00. */
  async function quickAdd(kind: "task" | "meeting", name: string, day: string) {
    const supabase = createClient();
    if (!supabase || !project) return;
    if (kind === "task") {
      const { data, error } = await supabase
        .from("project_tasks")
        .insert({ project_id: projectId, name, status: "Not Started", due_date: day, sort_order: tasks.length })
        .select()
        .single();
      if (error) setActionError(`Couldn't add task: ${error.message}`);
      if (!error && data) setTasks((prev) => [...prev, data as ProjectTask]);
    } else {
      const { data, error } = await supabase
        .from("activities")
        .insert({
          description: name,
          client_id: project.client_id,
          activity_date: `${day}T10:00`,
          follow_up_required: false,
        })
        .select()
        .single();
      if (error) setActionError(`Couldn't add meeting: ${error.message}`);
      if (!error && data) setActivityRows((prev) => [data as Activity, ...prev]);
    }
  }

  /** Change view tab; selection belongs to the List view, so drop it. */
  function switchTab(t: PageTab) {
    setTab(t);
    clear();
  }

  if (loading) {
    return <ProjectPageSkeleton />;
  }
  if (!project) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        Project not found.{" "}
        <Link href="/projects" className="text-primary hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Migration / action errors */}
      {(migrationMissing || actionError) && (
        <div className="flex items-start gap-2.5 rounded border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            {migrationMissing ? (
              <>
                <p className="font-medium">Tasks can&apos;t load — the database migration hasn&apos;t been run yet.</p>
                <p className="mt-0.5 text-warning/80">
                  Open Supabase → SQL Editor, paste{" "}
                  <span className="font-medium">supabase/migrations/2026-07-15_project_tasks_and_portal_logins.sql</span>{" "}
                  from the project folder, and click Run. Then refresh this page.
                </p>
              </>
            ) : (
              <p>{actionError}</p>
            )}
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
          <Link href="/projects" className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{project.name}</span>
        </div>
        <Popover
          align="right"
          trigger={
            <button className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          }
        >
          {(close) => (
            <MenuItem
              danger
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={() => {
                close();
                deleteProject();
              }}
            >
              Delete project
            </MenuItem>
          )}
        </Popover>
      </div>

      {/* Header card */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 sm:h-10 sm:w-10">
              <Box className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
            </div>
            {/* Wraps on a phone instead of truncating to "Social Media - Mark…" */}
            <h1 className="min-w-0 text-[17px] font-semibold leading-tight tracking-tight sm:truncate sm:text-[24px]">
              {project.name}
            </h1>
          </div>

          {/*
            Top-right of the card, level with the title.

            It lived at the end of the field row before, which had two costs:
            it competed with the chips for horizontal space (pushing Team onto
            a second line) and it read as one more attribute. The money is the
            headline fact about a project, so it belongs beside the headline.
          */}
          {projectDeal && (
            <div className="hidden shrink-0 items-stretch gap-4 sm:flex">
              <div className="w-px shrink-0 bg-border" />
              <div className="text-right">
                <Label>Deal</Label>
                <Link
                  href="/pipeline"
                  className="group -mr-1 flex items-center justify-end gap-1.5 rounded-md px-1 py-0.5 hover:bg-white/5"
                >
                  <span className="text-[19px] font-semibold leading-none tabular-nums">
                    {formatCurrency(Number(projectDeal.deal_value), projectDeal.currency)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
                {(() => {
                  const owed = Math.max(
                    0,
                    Number(projectDeal.deal_value) - Number(projectDeal.paid)
                  );
                  return (
                    <p className="mt-1 px-1 text-[11px]">
                      {owed > 0 ? (
                        <span className="text-warning">
                          {formatCurrency(owed, projectDeal.currency)} outstanding
                        </span>
                      ) : (
                        <span className="text-success">Paid in full</span>
                      )}
                    </p>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
        <textarea
          rows={2}
          placeholder="Add a short summary of this project..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            if (description !== (project.description ?? "")) {
              updateProject({ description });
            }
          }}
          className="mt-3 w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm leading-relaxed text-foreground-secondary placeholder:text-muted-2 hover:border-border focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        {/* Every control gets a label — an unlabelled chip row leaves you
            guessing which date is the start and who the person is. */}
        {/* Status sits with the other project attributes rather than floating
            in the top-right corner away from everything it relates to. */}
        {/* Phones get a two-column grid rather than a wrapping flex row: with
            flex-wrap the fields land at whatever x-offset the previous one
            happened to end at, which is the ragged look in the screenshots. */}
        {/* One row, full width. With the deal moved up to the title there's
            nothing competing for space, so the chips get the whole card and
            Team stays on the first line where it started. */}
        <div className="mt-4 grid grid-cols-2 items-end gap-x-3 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-5">
          <div className="min-w-0">
            <Label>Status</Label>
            <div className="flex h-9 items-center">
              <StatusPicker
                value={project.status}
                options={PROJECT_STATUSES}
                onChange={(status) => updateProject({ status })}
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label>Starts</Label>
            <div className="w-full sm:w-36">
              <DatePicker
                value={project.start_date}
                placeholder="Not set"
                onChange={(d) => updateProject({ start_date: d })}
              />
            </div>
          </div>
          <div className="min-w-0">
            <Label>Ends</Label>
            <div className="w-full sm:w-36">
              <DatePicker
                value={project.due_date}
                placeholder="Not set"
                onChange={(d) => updateProject({ due_date: d })}
              />
            </div>
          </div>
          {project.start_date && project.due_date && (
            <div className="min-w-0">
              <Label>Duration</Label>
              <div className="flex h-9 items-center text-xs text-muted-foreground">
                {Math.max(
                  1,
                  differenceInCalendarDays(
                    parseISO(project.due_date),
                    parseISO(project.start_date)
                  ) + 1
                )}{" "}
                days
              </div>
            </div>
          )}
          <div className="min-w-0">
            <Label>Client</Label>
          <Popover
            trigger={
              <button className="flex h-9 max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-white/5 bg-white/5 px-2.5 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{clientName(project.client_id)}</span>
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Client</MenuLabel>
                {clients.map((c) => (
                  <MenuItem
                    key={c.id}
                    selected={project.client_id === c.id}
                    onClick={() => {
                      updateProject({ client_id: c.id });
                      close();
                    }}
                  >
                    {c.company}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          </div>
          {projectClient && (
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <Label>Last contact</Label>
              {isSameDayAsToday(projectClient.last_contact) ? (
                <div className="flex h-9 items-center gap-1.5 text-[11px] text-success">
                  <Check className="h-3 w-3" /> Contacted today
                </div>
              ) : (
                <div className="flex h-9 items-center gap-2">
                  <button
                    type="button"
                    onClick={markContacted}
                    className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/5 px-2.5 py-2 text-xs font-medium text-foreground-secondary transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                  >
                    <PhoneCall className="h-3 w-3" /> Contacted today
                  </button>
                  {projectClient.last_contact && (
                    <span className="text-[11px] text-muted-2">
                      {formatDistanceToNow(parseISO(projectClient.last_contact), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="min-w-0">
            <Label>Lead</Label>
          <Popover
            trigger={
              <button className="flex h-9 max-w-full items-center gap-2 overflow-hidden rounded-md border border-white/5 bg-white/5 px-2.5 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                {project.owner ? (
                  <>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary">
                      {initials(personName(project.owner))}
                    </span>
                    <span className="truncate">{personName(project.owner)}</span>
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3 shrink-0 text-muted-foreground" /> Assign lead
                  </>
                )}
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Assign lead</MenuLabel>
                <MenuItem selected={!project.owner} onClick={() => { updateProject({ owner: null }); close(); }}>
                  Unassigned
                </MenuItem>
                {profiles.map((p) => (
                  <MenuItem
                    key={p.id}
                    selected={project.owner === p.id}
                    onClick={() => { updateProject({ owner: p.id }); close(); }}
                  >
                    {p.full_name}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          </div>
          <div className="min-w-0">
            <Label>Team</Label>
            <Popover
              trigger={
                <button className="flex h-9 max-w-full items-center gap-2 overflow-hidden rounded-md border border-white/5 bg-white/5 px-2.5 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                  {projectMembers.length > 0 ? (
                    <>
                      <AvatarStack people={projectMembers} />
                      {projectMembers.length} on this
                    </>
                  ) : (
                    <>
                      <Users className="h-3 w-3 text-muted-foreground" /> Add team
                    </>
                  )}
                </button>
              }
            >
              {() => (
                <>
                  <MenuLabel>Project team</MenuLabel>
                  {profiles.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No team members yet.
                    </div>
                  )}
                  {profiles.map((p) => {
                    const on = (project.member_ids ?? []).includes(p.id);
                    return (
                      <MenuItem
                        key={p.id}
                        selected={on}
                        onClick={() => {
                          const current = project.member_ids ?? [];
                          updateProject({
                            member_ids: on
                              ? current.filter((id) => id !== p.id)
                              : [...current, p.id],
                          });
                          // Stay open — picking a team is a multi-step action
                          // and reopening the menu per person is tedious.
                        }}
                      >
                        {p.full_name}
                      </MenuItem>
                    );
                  })}
                </>
              )}
            </Popover>
          </div>
        </div>
      </Card>

      {/* View switcher */}
      <div className="flex w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-surface p-1 sm:w-fit">
        <PageTabButton active={tab === "overview"} onClick={() => switchTab("overview")} icon={LayoutDashboard} label="Overview" />
        <PageTabButton active={tab === "board"} onClick={() => switchTab("board")} icon={LayoutGrid} label="Kanban" />
        <PageTabButton active={tab === "tasks"} onClick={() => switchTab("tasks")} icon={List} label="List" />
        <PageTabButton active={tab === "calendar"} onClick={() => switchTab("calendar")} icon={CalendarIcon} label="Calendar" />
      </div>

      {tab !== "overview" && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          views={views}
          onViewsChange={setViews}
          statuses={TASK_STATUSES}
          assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
          labels={taskLabels}
          priorities
          showDue
          placeholder="Filter tasks…"
        />
      )}

      <div key={tab} className="animate-page">
      {/* ============ OVERVIEW ============ */}
      {tab === "overview" && (
        <DashGrid
          storageKey={`trydent-overview-layout:${projectId}`}
          cards={[
          { id: "progress", defaultSpan: 1, render: () => (
          <Card className="flex flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <h3 className="text-sm font-semibold">Project Progress</h3>
              <button
                onClick={() => setTab("tasks")}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {/* The ring takes the leftover height and centres in it, so the
                card can't end with a band of empty space. */}
            <div className="flex min-h-0 flex-1 items-center justify-center py-2">
              <ProgressRing pct={completion} />
            </div>
            <div className="mt-2 grid shrink-0 grid-cols-3 gap-2 text-center">
              <StatusCount count={done.length} label="Done" dotClass="bg-success" />
              <StatusCount count={inProgress.length} label="In progress" dotClass="bg-blue-400" />
              <StatusCount count={notStarted.length} label="To do" dotClass="bg-muted-foreground" />
            </div>
          </Card>
          )},
          { id: "tasks", defaultSpan: 1, render: () => (
          <Card className="flex flex-col overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                Tasks
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  {active.length - done.length} open
                </span>
              </h3>
              <button
                onClick={() => setTab("tasks")}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <form onSubmit={addTask} className="mb-3 flex items-center gap-2">
              <Input
                placeholder="+ Add new task"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
              {newTask.trim() && (
                <Button type="submit" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </form>
            {/* Scrolls rather than growing: the card keeps its slot in the grid
                however many tasks land in it. */}
            <div className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              {active.length === 0 && (
                <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">
                  No tasks yet.
                </p>
              )}
              {[...notStarted, ...inProgress, ...done].map((t) => (
                <div
                  key={t.id}
                  onMouseEnter={() => setHoverTask(t.id)}
                  onMouseLeave={() => setHoverTask(null)}
                  className={cn(
                    "group flex items-center gap-2.5 rounded px-1.5 py-1.5 transition-colors",
                    hoverTask === t.id ? "bg-white/[0.07]" : "hover:bg-white/5"
                  )}
                >
                  <button
                    onClick={() =>
                      updateTask(t.id, { status: t.status === "Done" ? "Not Started" : "Done" })
                    }
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      t.status === "Done"
                        ? "border-primary bg-primary"
                        : "border-muted-2 hover:border-muted-foreground"
                    )}
                    title={t.status === "Done" ? "Mark as not started" : "Mark as done"}
                  >
                    {t.status === "Done" && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => setDetailTaskId(t.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-sm hover:underline",
                      t.status === "Done" && "text-muted-foreground line-through"
                    )}
                  >
                    {t.name}
                  </button>
                  {t.due_date && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {format(parseISO(t.due_date), "MMM d")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
          )},
          { id: "calendar", defaultSpan: 1, render: () => (
            <MiniCalendar
              tasks={active}
              meetings={clientMeetings}
              highlightId={hoverTask}
              onHoverTask={setHoverTask}
            />
          ) },
          { id: "meetings", defaultSpan: 1, render: () => (
          <Card className="flex flex-col overflow-hidden">
            <h3 className="mb-3 flex shrink-0 items-center gap-2 text-sm font-semibold">
              Upcoming Meetings
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                {upcomingSchedule.length}
              </span>
              <button
                type="button"
                onClick={newMeeting}
                className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-normal text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Schedule
              </button>
            </h3>
            {upcomingSchedule.length === 0 && (
              <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled with {clientName(project.client_id)}.
              </p>
            )}
            <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
              {upcomingSchedule.map((a, i) =>
                i === 0 ? (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openMeeting(a)}
                    title="Edit this meeting"
                    className="rounded-md bg-primary p-3 text-left text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {format(parseISO(a.activity_date), "HH:mm")}
                      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
                        {format(parseISO(a.activity_date), "EEE, MMM d")}
                      </span>
                    </p>
                    <p className="mt-1 text-[13px] leading-snug opacity-90">{a.description}</p>
                  </button>
                ) : (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => openMeeting(a)}
                    title="Edit this meeting"
                    className="border-t border-border-subtle px-1 py-2.5 text-left transition-colors first:border-0 hover:bg-white/[0.03]"
                  >
                    <p className="text-sm font-medium text-foreground-secondary">
                      {format(parseISO(a.activity_date), "HH:mm")}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {format(parseISO(a.activity_date), "EEE, MMM d")}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                  </button>
                )
              )}
            </div>
          </Card>
          )},
          { id: "timeline", defaultSpan: 2, render: () => (
          <Card className="flex flex-col overflow-hidden">
            <h3 className="mb-3 shrink-0 text-sm font-semibold">Tasks Timeline</h3>
            <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
              <TasksTimeline
                tasks={active}
                highlightId={hoverTask}
                onHoverTask={setHoverTask}
              />
            </div>
          </Card>
          )},
          ]}
        />
      )}

      {/* ============ BOARD ============ */}
      {tab === "board" && (
        <div className="flex flex-col gap-3">
          <form onSubmit={addTask} className="flex max-w-md items-center gap-2">
            <Input
              placeholder="+ Add new task"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!newTask.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
          <KanbanBoard
            columns={BOARD_STATUSES.map((s) => ({ id: s, label: s }))}
            items={visibleActive}
            getColumnId={(t) => t.status}
            onMove={(t, status) => updateTask(t.id, { status: status as TaskStatus })}
            renderCard={(t) => {
              const stats = subtaskStats.get(t.id);
              const linkCount = Array.isArray(t.links) ? t.links.length : 0;
              return (
                <div onClick={() => setDetailTaskId(t.id)}>
                  {(t.label || t.approved_at) && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      {t.label && <LabelChip label={t.label} />}
                      {t.approved_at && (
                        <span
                          title="Approved by client"
                          className="inline-flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success"
                        >
                          <CheckCheck className="h-3 w-3" /> Approved
                        </span>
                      )}
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <PriorityFlag priority={t.priority} />
                    {t.name}
                    <RecurrenceIndicator recurrence={t.recurrence} />
                  </p>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center gap-3">
                    {t.assigned_to && (
                      <span
                        title={personName(t.assigned_to) ?? undefined}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary"
                      >
                        {initials(personName(t.assigned_to))}
                      </span>
                    )}
                    {t.due_date && (
                      <span className="text-[11px] text-muted-foreground">{formatDate(t.due_date)}</span>
                    )}
                    <span className="ml-auto flex items-center gap-2.5 text-[11px] text-muted-foreground">
                      {linkCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> {linkCount}
                        </span>
                      )}
                      {stats && stats.total > 0 && (
                        <span className="flex items-center gap-1">
                          <ListChecks className="h-3 w-3" /> {stats.done}/{stats.total}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* ============ TASKS LIST ============ */}
      {tab === "tasks" && (
        <div className="flex flex-col gap-3">
          <form onSubmit={addTask} className="flex max-w-md items-center gap-2">
            <Input
              placeholder="+ Add new task"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!newTask.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>

          {/*
            The shared DataTable, not a hand-rolled row list.

            This was the one list in the app that didn't use it, so it had no
            sortable headers, no column icons, no fixed widths and no
            pagination — and it visibly didn't match Projects or Clients. Every
            behaviour below (inline status, inline due date, the row menu)
            survives; they're just cells now.
          */}
          <DataTable
            columns={taskColumns}
            rows={visibleTasks}
            rowKey={(t) => t.id}
            pageSize={15}
            minWidth="820px"
            selection={{ selected, onToggle: toggle, onToggleAll: setMany }}
            emptyMessage={
              tasks.length > 0
                ? "No tasks match the current filters."
                : "No tasks yet."
            }
          />
        </div>
      )}

      {/* ============ CALENDAR ============ */}
      {tab === "calendar" && (
        <ProjectCalendar
          tasks={visibleActive}
          meetings={clientMeetings}
          onQuickAdd={quickAdd}
        />
      )}
      </div>

      <BulkActionBar
        count={selectedIds.length}
        onClear={clear}
        statuses={TASK_STATUSES}
        onSetStatus={(s) => bulkUpdateTasks({ status: s as TaskStatus }, "Status")}
        assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
        onSetAssignee={(id) => bulkUpdateTasks({ assigned_to: id }, "Assignee")}
        showPriority
        onSetPriority={(p: TaskPriority) => bulkUpdateTasks({ priority: p }, "Priority")}
        showDue
        onSetDue={(d) => bulkUpdateTasks({ due_date: d }, "Due date")}
        labels={taskLabels}
        onSetLabel={(l) => bulkUpdateTasks({ label: l }, "Label")}
        onDelete={bulkDeleteTasks}
      />

      {/* Task detail */}
      <TaskDetailDrawer
        task={tasks.find((t) => t.id === detailTaskId) ?? null}
        profiles={profiles}
        onClose={() => setDetailTaskId(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onSkip={skipTask}
      />

      {/* Schedule a meeting */}
      <Drawer
        open={meetingOpen}
        onClose={() => setMeetingOpen(false)}
        title={editingMeetingId ? "Edit meeting" : "Schedule a meeting"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMeeting();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <Label>What is it about?</Label>
            <Input
              placeholder="Weekly check-in"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <DatePicker
                value={meetingDate}
                onChange={(d) => setMeetingDate(d ?? format(new Date(), "yyyy-MM-dd"))}
              />
            </div>
            <div>
              <Label>Time</Label>
              <Input
                type="time"
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Agenda</Label>
            <Textarea
              rows={3}
              placeholder="What are we covering?"
              value={meetingAgenda}
              onChange={(e) => setMeetingAgenda(e.target.value)}
            />
          </div>
          <div>
            <Label>Attendees</Label>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-white/15 bg-white/[0.02] p-2">
              {profiles.length === 0 && (
                <span className="px-1 text-xs text-muted-foreground">
                  No team members yet.
                </span>
              )}
              {profiles.map((p) => {
                const on = meetingAttendees.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setMeetingAttendees((prev) =>
                        on ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                      )
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                      on
                        ? "border-primary/40 bg-primary/15 text-foreground"
                        : "border-white/10 text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    <Avatar name={p.full_name} url={p.avatar_url} size="xs" />
                    {p.full_name}
                  </button>
                );
              })}
            </div>
            {projectMembers.length > 0 && (
              <button
                type="button"
                onClick={() => setMeetingAttendees(projectMembers.map((p) => p.id))}
                className="mt-1.5 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Add everyone on this project
              </button>
            )}
          </div>
          <Checkbox
            align="start"
            className="text-sm"
            checked={meetingVisible}
            onChange={setMeetingVisible}
            label={
              <span>
                Show in the client portal
                <span className="block text-xs text-muted-foreground">
                  {clientName(project.client_id)} will see the time, agenda and attendees.
                </span>
              </span>
            }
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={meetingBusy || !meetingTitle.trim()}>
              {meetingBusy
                ? "Saving..."
                : editingMeetingId
                  ? "Save changes"
                  : "Schedule meeting"}
            </Button>
            {/* Cancelling is only offered on something that exists. */}
            {editingMeetingId && (
              <button
                type="button"
                onClick={deleteMeeting}
                className="rounded-md px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
              >
                Cancel meeting
              </button>
            )}
          </div>
        </form>
      </Drawer>
    </div>
  );
}

/* ---------------------------------- Pieces ---------------------------------- */

function ProgressRing({ pct }: { pct: number }) {
  const r = 50;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    // Double rAF so the 0-state paints first and the arc visibly sweeps in.
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(pct)));
    return () => cancelAnimationFrame(t);
  }, [pct]);
  const color = pct >= 100 ? "var(--success)" : "var(--primary)";
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${Math.max((drawn / 100) * c, 0.01)} ${c}`}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
      <text x="60" y="58" textAnchor="middle" fill="var(--foreground)" fontSize="22" fontWeight="600">
        {pct}%
      </text>
      <text x="60" y="76" textAnchor="middle" fill="var(--muted-foreground)" fontSize="9">
        completed
      </text>
    </svg>
  );
}

function StatusCount({ count, label, dotClass }: { count: number; label: string; dotClass: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{count}</p>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} /> {label}
      </p>
    </div>
  );
}

function MiniCalendar({
  tasks,
  meetings,
  highlightId,
}: {
  tasks: ProjectTask[];
  meetings: Activity[];
  /** Task hovered elsewhere on the Overview — its due date gets a ring. */
  highlightId?: string | null;
  onHoverTask?: (id: string | null) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const dueDays = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.due_date) set.add(t.due_date.slice(0, 10));
    return set;
  }, [tasks]);

  const meetingDays = useMemo(() => {
    const set = new Set<string>();
    for (const m of meetings) set.add(m.activity_date.slice(0, 10));
    return set;
  }, [meetings]);

  /** The due date of whatever task is hovered elsewhere, so we can ring it. */
  const highlightDay = useMemo(() => {
    if (!highlightId) return null;
    const t = tasks.find((x) => x.id === highlightId);
    return t?.due_date ? t.due_date.slice(0, 10) : null;
  }, [highlightId, tasks]);

  /** Day key → what's on it, for the hover card. */
  const byDay = useMemo(() => {
    const map = new Map<string, { meetings: Activity[]; tasks: ProjectTask[] }>();
    const bucket = (k: string) => {
      const existing = map.get(k);
      if (existing) return existing;
      const fresh = { meetings: [] as Activity[], tasks: [] as ProjectTask[] };
      map.set(k, fresh);
      return fresh;
    };
    for (const m of meetings) bucket(m.activity_date.slice(0, 10)).meetings.push(m);
    for (const t of tasks) if (t.due_date) bucket(t.due_date.slice(0, 10)).tasks.push(t);
    return map;
  }, [meetings, tasks]);

  return (
    // The weeks stretch to fill whatever height the row gives this card, so a
    // tall neighbour no longer leaves a band of empty space underneath.
    <Card className="flex flex-col overflow-hidden">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold">Calendar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-medium">{format(month, "MMM yyyy")}</span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-7 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-medium text-muted-2">{d}</span>
        ))}
      </div>
      <div
        className="grid min-h-0 flex-1 grid-cols-7 text-center"
        style={{
          // One row per week, each an equal share of the leftover height.
          gridTemplateRows: `repeat(${grid.length / 7}, minmax(0, 1fr))`,
        }}
      >
        {grid.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const hasDue = dueDays.has(key);
          const hasMeeting = meetingDays.has(key);
          const detail = byDay.get(key);
          return (
            <span
              key={day.toISOString()}
              className={cn(
                // self-center keeps the circle vertically centred now that the
                // week row can be taller than the circle itself.
                "hover-reveal-host relative mx-auto flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-xs transition-[box-shadow,transform] duration-150",
                isToday(day)
                  ? "bg-primary font-semibold text-primary-foreground"
                  : hasDue || hasMeeting
                    ? "bg-primary/20 font-medium text-foreground"
                    : isSameMonth(day, month)
                      ? "text-foreground"
                      : "text-muted-2",
                highlightDay === key && "scale-110 ring-2 ring-white/70"
              )}
            >
              {format(day, "d")}
              {/* Two dots so a day with both reads as busy at a glance. */}
              {!isToday(day) && (hasDue || hasMeeting) && (
                <span className="absolute bottom-0.5 flex gap-0.5">
                  {hasDue && <span className="h-1 w-1 rounded-full bg-primary" />}
                  {hasMeeting && <span className="h-1 w-1 rounded-full bg-warning" />}
                </span>
              )}
              {detail && (
                <span className="hover-reveal pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 flex w-52 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left shadow-xl">
                  <span className="text-[11px] font-medium text-foreground">
                    {format(day, "EEEE, MMM d")}
                  </span>
                  {detail.meetings.map((m) => (
                    <span key={m.id} className="flex items-start gap-1.5 text-[11px]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                      <span className="min-w-0 flex-1 text-foreground-secondary">
                        {format(parseISO(m.activity_date), "HH:mm")} · {m.description}
                      </span>
                    </span>
                  ))}
                  {detail.tasks.map((t) => (
                    <span key={t.id} className="flex items-start gap-1.5 text-[11px]">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="min-w-0 flex-1 text-foreground-secondary">{t.name}</span>
                    </span>
                  ))}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </Card>
  );
}

function ProjectCalendar({
  tasks,
  meetings,
  onQuickAdd,
}: {
  tasks: ProjectTask[];
  /** This client's activities. Without them the calendar silently omitted every
   *  meeting, including ones scheduled from the Overview tab. */
  meetings: Activity[];
  onQuickAdd: (kind: "task" | "meeting", name: string, day: string) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(null);
  const [quickName, setQuickName] = useState("");
  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const tasksOn = (day: Date) =>
    tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), day));

  const meetingsOn = (day: Date) =>
    meetings
      .filter((m) => isSameDay(parseISO(m.activity_date), day))
      .sort((a, b) => a.activity_date.localeCompare(b.activity_date));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const dayTasks = tasksOn(day);
            const dayMeetings = meetingsOn(day);
            const isSelected = !!selected && isSameDay(day, selected);
            const overflow = dayTasks.length + dayMeetings.length - 2;
            const busy = dayTasks.length + dayMeetings.length > 0;
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelected(isSelected ? null : day)}
                className={cn(
                  // `hover-reveal-host` + `relative` anchor the hover card below.
                  "hover-reveal-host relative flex h-20 flex-col items-stretch gap-0.5 rounded border p-1 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:bg-white/5",
                  !isSameMonth(day, month) && "opacity-40"
                )}
              >
                {/* Hover detail. Only rendered for days that have something on
                    them, so an empty cell doesn't flash an empty card. */}
                {busy && (
                  <span className="hover-reveal pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 flex w-56 flex-col gap-1 rounded-lg border border-border bg-surface p-2.5 text-left shadow-xl">
                    <span className="text-[11px] font-medium text-foreground">
                      {format(day, "EEEE, MMM d")}
                    </span>
                    {dayMeetings.map((m) => (
                      <span key={m.id} className="flex items-start gap-1.5 text-[11px]">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                        <span className="min-w-0 flex-1 text-foreground-secondary">
                          {format(parseISO(m.activity_date), "HH:mm")} · {m.description}
                        </span>
                      </span>
                    ))}
                    {dayTasks.map((t) => (
                      <span key={t.id} className="flex items-start gap-1.5 text-[11px]">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 flex-1 text-foreground-secondary">
                          {t.name}
                          <span className="ml-1 text-muted-2">due</span>
                        </span>
                      </span>
                    ))}
                  </span>
                )}
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
                {/* Meetings lead: a fixed time matters more at a glance than a
                    due date. Colours come from the `-fg` tokens rather than
                    being picked by hand — the event fills used to be pale and
                    these were hardcoded dark to suit, which broke the moment
                    the palette went dark-tinted. */}
                {dayMeetings.slice(0, 2).map((m) => (
                  <span
                    key={m.id}
                    className="truncate rounded px-1 py-px text-[11px] font-semibold"
                    style={{
                      background: "var(--event-yellow-bg)",
                      color: "var(--event-yellow-fg)",
                      boxShadow: "inset 2px 0 0 0 var(--event-yellow-bar)",
                    }}
                  >
                    {format(parseISO(m.activity_date), "HH:mm")} {m.description}
                  </span>
                ))}
                {dayTasks.slice(0, Math.max(0, 2 - dayMeetings.length)).map((t) => (
                  <span
                    key={t.id}
                    className="truncate rounded px-1 py-px text-[11px] font-semibold"
                    style={{
                      background: "var(--event-indigo-bg)",
                      color: "var(--event-indigo-fg)",
                      boxShadow: "inset 2px 0 0 0 var(--event-indigo-bar)",
                    }}
                  >
                    {t.name}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="px-1 text-[10px] text-muted-foreground">+{overflow}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {selected ? format(selected, "MMMM d, yyyy") : "Scheduled"}
        </h3>

        {selected && (
          <div className="mb-3 flex flex-col gap-2 rounded border border-border bg-white/[0.02] p-2.5">
            <Input
              placeholder={`Add on ${format(selected, "MMM d")}...`}
              value={quickName}
              onChange={(e) => setQuickName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={!quickName.trim()}
                onClick={() => {
                  onQuickAdd("task", quickName.trim(), format(selected, "yyyy-MM-dd"));
                  setQuickName("");
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Task
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={!quickName.trim()}
                onClick={() => {
                  onQuickAdd("meeting", quickName.trim(), format(selected, "yyyy-MM-dd"));
                  setQuickName("");
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Meeting
              </Button>
            </div>
          </div>
        )}

        {(() => {
          const shownMeetings = selected
            ? meetingsOn(selected)
            : [...meetings].sort((a, b) => a.activity_date.localeCompare(b.activity_date));
          const shownTasks = selected
            ? tasksOn(selected)
            : tasks
                .filter((t) => t.due_date)
                .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

          if (shownMeetings.length === 0 && shownTasks.length === 0) {
            return (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled here.
              </p>
            );
          }

          return (
            <div className="flex flex-col divide-y divide-border-subtle">
              {shownMeetings.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 py-2.5">
                  <Badge tone="yellow" dot>
                    Meeting
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.description}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(parseISO(m.activity_date), "MMM d · HH:mm")}
                  </span>
                </div>
              ))}
              {shownTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                  <Badge tone={statusTone(t.status)} dot>
                    {t.status}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(t.due_date)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}

/* ---------------------------------- Tasks timeline ---------------------------------- */

const TIMELINE_COLORS = ["#a855f7", "#4cb782", "#6c74dd", "#4ea7e0", "#d9a53f", "#d95c8a"];

/**
 * Gantt-style strip: one bar per task, spanning its working window.
 *
 * Three things this gets right that the previous version didn't.
 *
 * 1. The window is derived from the tasks, not a fixed 12 days around today.
 *    A task due last week or next month used to be clamped to the edge and
 *    rendered in the wrong place; now the strip always contains its own data.
 *
 * 2. A bar starts at `min(created_at, due_date)`. Using `created_at` alone
 *    broke whenever a task was entered after its deadline — a very normal thing
 *    to do — producing a negative width that then hit a 10% minimum and pushed
 *    the bar past its own due date. That's why several tasks appeared stacked
 *    at the same spot regardless of when they were actually due.
 *
 * 3. Axis labels are positioned at their true percentage rather than spread
 *    with `justify-between`, so a tick genuinely sits above the date it names.
 */
function TasksTimeline({
  tasks,
  highlightId,
  onHoverTask,
}: {
  tasks: ProjectTask[];
  highlightId?: string | null;
  onHoverTask?: (id: string | null) => void;
}) {
  const rows = tasks
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 6);

  const spans = rows.map((t) => {
    const due = startOfDay(parseISO(t.due_date as string));
    const created = startOfDay(parseISO(t.created_at));
    // A deadline can predate the record. Whichever is earlier is the real start.
    return { task: t, start: created < due ? created : due, end: addDays(due, 1) };
  });

  if (spans.length === 0) {
    return (
      <p className="flex h-full items-center justify-center py-8 text-center text-sm text-muted-foreground">
        Give tasks due dates and they&apos;ll appear here as a timeline.
      </p>
    );
  }

  const today = startOfDay(new Date());
  const stamps = [
    ...spans.map((s) => s.start.getTime()),
    ...spans.map((s) => s.end.getTime()),
    today.getTime(),
  ];
  // One day of breathing room so nothing is flush against the edge.
  const rawMin = addDays(new Date(Math.min(...stamps)), -1);
  const rawMax = addDays(new Date(Math.max(...stamps)), 1);
  const DAY = 86_400_000;
  // Keep a floor on the span so a single one-day task doesn't fill the strip.
  const spanMs = Math.max(rawMax.getTime() - rawMin.getTime(), 7 * DAY);
  const windowStart = rawMin;

  const pct = (d: Date) =>
    Math.min(Math.max((d.getTime() - windowStart.getTime()) / spanMs, 0), 1) * 100;
  const todayPct = pct(today);

  // Six evenly spaced ticks across whatever range we ended up with.
  const ticks = Array.from({ length: 6 }, (_, i) => {
    const at = new Date(windowStart.getTime() + (spanMs * i) / 5);
    return { at, pct: (i / 5) * 100 };
  });

  return (
    /*
     * Fills the card rather than sitting at its natural height.
     *
     * The card lives in the resizable overview grid, so its height is whatever
     * you dragged it to. A fixed stack of six 28px rows left a dead band under
     * the last bar at any size above the minimum — the same failure as the
     * throughput chart. The rows now share the leftover space.
     */
    <div className="relative flex h-full min-h-[9rem] flex-col pt-1">
      {/* Today line */}
      {todayPct > 0 && todayPct < 100 && (
        <div
          className="pointer-events-none absolute bottom-7 top-0 z-10 w-px bg-primary"
          style={{ left: `${todayPct}%` }}
        >
          <span className="absolute -left-[3px] -top-1 h-2 w-2 rounded-full border-2 border-primary bg-panel" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        {spans.map(({ task: t, start, end }, i) => {
          const dimmed = !!highlightId && highlightId !== t.id;
          const lit = highlightId === t.id;
          const left = pct(start);
          // Floor the width in pixels, not percent, so a short task stays
          // visible without overstating how long it ran.
          const width = pct(end) - left;
          const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
          const overdue =
            t.status !== "Done" && t.status !== "Archived" && parseISO(t.due_date!) < today;
          return (
            <div
              key={t.id}
              // min-h keeps a bar readable when the card is short; flex-1 lets
              // the rows grow together when it's tall.
              className="relative min-h-7 flex-1 border-b border-dashed border-border-subtle"
            >
              <div
                onMouseEnter={() => onHoverTask?.(t.id)}
                onMouseLeave={() => onHoverTask?.(null)}
                title={`${t.name} — due ${formatDate(t.due_date)}${overdue ? " (overdue)" : ""}`}
                className={cn(
                  // Centred in the row now that the row's height varies.
                  "absolute top-1/2 flex h-6 min-w-[3rem] -translate-y-1/2 items-center overflow-hidden rounded-full px-2.5 text-[11px] font-medium text-white shadow-sm transition-[opacity,box-shadow,transform] duration-150",
                  t.status === "Done" && "opacity-60",
                  overdue && "ring-1 ring-danger",
                  // Fade the others rather than recolouring the target — the
                  // bar colours already carry meaning.
                  dimmed && "opacity-25",
                  lit && "scale-[1.02] opacity-100 ring-2 ring-white/70"
                )}
                style={{ left: `${left}%`, width: `${width}%`, background: color }}
              >
                <span className="truncate">{t.name}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date labels, anchored to their true position */}
      <div className="relative mt-2 h-4">
        {ticks.map(({ at, pct: p }, i) => (
          <span
            key={at.getTime()}
            className="absolute whitespace-nowrap text-[10px] tabular-nums text-muted-2"
            style={{
              left: `${p}%`,
              // Nudge the end labels inward so they don't clip the card.
              transform:
                i === 0
                  ? "translateX(0)"
                  : i === ticks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {format(at, "MMM d")}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Deterministic colored chip for free-text task labels. */
const LABEL_STYLES = [
  "bg-warning/15 text-warning",
  "bg-success/15 text-success",
  "bg-blue-400/15 text-blue-400",
  "bg-primary/15 text-primary",
  "bg-pink-400/15 text-pink-400",
  "bg-danger/15 text-danger",
];

function labelChipClass(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return LABEL_STYLES[Math.abs(hash) % LABEL_STYLES.length];
}

function LabelChip({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
        labelChipClass(label)
      )}
    >
      {label}
    </span>
  );
}

function PageTabButton({
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
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
