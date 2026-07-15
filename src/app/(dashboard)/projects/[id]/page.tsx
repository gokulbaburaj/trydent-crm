"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
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
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutDashboard,
  Link2,
  List,
  ListChecks,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate, initials, cn } from "@/lib/utils";
import { useTabs } from "@/lib/tabs";
import type { Activity, Client, Profile, Project, ProjectTask, TaskItem, TaskStatus } from "@/lib/types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

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
  const [tab, setTab] = useState<PageTab>("overview");
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
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
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
    () => allTasks.filter((t) => t.project_id === projectId),
    [allTasks, projectId]
  );

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
  const personName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? null;

  const active = tasks.filter((t) => t.status !== "Archived");
  const done = active.filter((t) => t.status === "Done");
  const inProgress = active.filter((t) => t.status === "In Progress");
  const notStarted = active.filter((t) => t.status === "Not Started");
  const completion = active.length > 0 ? Math.round((done.length / active.length) * 100) : 0;

  const upcomingSchedule = useMemo(() => {
    if (!project) return [];
    const now = new Date();
    return activities
      .filter((a) => a.client_id === project.client_id && parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 4);
  }, [activities, project]);

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
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_tasks").update(patch).eq("id", id);
    if (error) setActionError(`Couldn't update task: ${error.message}`);
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

  if (loading) {
    return <p className="py-20 text-center text-sm text-muted">Loading...</p>;
  }
  if (!project) {
    return (
      <div className="py-20 text-center text-sm text-muted">
        Project not found.{" "}
        <Link href="/projects" className="text-accent hover:underline">
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
        <div className="flex items-center gap-1 text-[13px] text-muted">
          <Link href="/projects" className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{project.name}</span>
        </div>
        <Popover
          align="right"
          trigger={
            <button className="rounded p-1.5 text-muted hover:bg-white/5 hover:text-foreground">
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
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15">
              <Box className="h-5 w-5 text-accent" />
            </div>
            <h1 className="truncate text-[24px] font-semibold tracking-tight">{project.name}</h1>
          </div>
          <StatusPicker
            align="right"
            value={project.status}
            options={PROJECT_STATUSES}
            onChange={(status) => updateProject({ status })}
          />
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
          className="mt-3 w-full resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-sm leading-relaxed text-foreground-secondary placeholder:text-muted-2 hover:border-border focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted" />
            <div className="w-36">
              <DatePicker
                value={project.start_date}
                placeholder="Start"
                onChange={(d) => updateProject({ start_date: d })}
              />
            </div>
            <span className="text-muted">→</span>
            <div className="w-36">
              <DatePicker
                value={project.due_date}
                placeholder="Deadline"
                onChange={(d) => updateProject({ due_date: d })}
              />
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary">
            {clientName(project.client_id)}
          </span>
          <Popover
            trigger={
              <button className="flex items-center gap-2 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                {project.owner ? (
                  <>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[8px] font-semibold text-accent">
                      {initials(personName(project.owner))}
                    </span>
                    {personName(project.owner)}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3 text-muted" /> Assign lead
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
      </Card>

      {/* View switcher */}
      <div className="flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface p-1">
        <PageTabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={LayoutDashboard} label="Overview" />
        <PageTabButton active={tab === "board"} onClick={() => setTab("board")} icon={LayoutGrid} label="Kanban" />
        <PageTabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={List} label="List" />
        <PageTabButton active={tab === "calendar"} onClick={() => setTab("calendar")} icon={CalendarIcon} label="Calendar" />
      </div>

      {/* ============ OVERVIEW ============ */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Progress */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Project Progress</h3>
              <button
                onClick={() => setTab("tasks")}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Manage <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="flex justify-center py-2">
              <ProgressRing pct={completion} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <StatusCount count={done.length} label="Done" dotClass="bg-success" />
              <StatusCount count={inProgress.length} label="In progress" dotClass="bg-blue-400" />
              <StatusCount count={notStarted.length} label="To do" dotClass="bg-muted" />
            </div>
          </Card>

          {/* Tasks checklist */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                Tasks
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted">
                  {active.length - done.length} open
                </span>
              </h3>
              <button
                onClick={() => setTab("tasks")}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
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
            <div className="flex flex-col">
              {active.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">No tasks yet.</p>
              )}
              {[...notStarted, ...inProgress, ...done].slice(0, 7).map((t) => (
                <div
                  key={t.id}
                  className="group flex items-center gap-2.5 rounded px-1.5 py-1.5 hover:bg-white/5"
                >
                  <button
                    onClick={() =>
                      updateTask(t.id, { status: t.status === "Done" ? "Not Started" : "Done" })
                    }
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      t.status === "Done"
                        ? "border-accent bg-accent"
                        : "border-muted-2 hover:border-muted"
                    )}
                    title={t.status === "Done" ? "Mark as not started" : "Mark as done"}
                  >
                    {t.status === "Done" && (
                      <Check className="h-3 w-3 text-accent-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => setDetailTaskId(t.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-sm hover:underline",
                      t.status === "Done" && "text-muted line-through"
                    )}
                  >
                    {t.name}
                  </button>
                  {t.due_date && (
                    <span className="shrink-0 text-[11px] text-muted">
                      {format(parseISO(t.due_date), "MMM d")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Mini calendar */}
          <MiniCalendar tasks={active} />

          {/* Upcoming meetings for this client */}
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              Upcoming Meetings
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted">
                {upcomingSchedule.length}
              </span>
            </h3>
            {upcomingSchedule.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                Nothing scheduled with {clientName(project.client_id)}.
              </p>
            )}
            <div className="flex flex-col gap-1">
              {upcomingSchedule.map((a, i) =>
                i === 0 ? (
                  <div key={a.id} className="rounded-md bg-accent p-3 text-accent-foreground">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {format(parseISO(a.activity_date), "HH:mm")}
                      <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
                        {format(parseISO(a.activity_date), "EEE, MMM d")}
                      </span>
                    </p>
                    <p className="mt-1 text-[13px] leading-snug opacity-90">{a.description}</p>
                  </div>
                ) : (
                  <div
                    key={a.id}
                    className="border-t border-border-subtle px-1 py-2.5 first:border-0"
                  >
                    <p className="text-sm font-medium text-foreground-secondary">
                      {format(parseISO(a.activity_date), "HH:mm")}
                      <span className="ml-2 text-[11px] font-normal text-muted">
                        {format(parseISO(a.activity_date), "EEE, MMM d")}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">{a.description}</p>
                  </div>
                )
              )}
            </div>
          </Card>

          {/* Tasks timeline */}
          <Card className="lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold">Tasks Timeline</h3>
            <TasksTimeline tasks={active} />
          </Card>
        </div>
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
            items={tasks.filter((t) => t.status !== "Archived")}
            getColumnId={(t) => t.status}
            onMove={(t, status) => updateTask(t.id, { status: status as TaskStatus })}
            renderCard={(t) => {
              const stats = subtaskStats.get(t.id);
              const linkCount = Array.isArray(t.links) ? t.links.length : 0;
              return (
                <div onClick={() => setDetailTaskId(t.id)}>
                  {t.label && (
                    <div className="mb-1.5">
                      <LabelChip label={t.label} />
                    </div>
                  )}
                  <p className="text-sm font-medium">{t.name}</p>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center gap-3">
                    {t.assigned_to && (
                      <span
                        title={personName(t.assigned_to) ?? undefined}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[9px] font-semibold text-accent"
                      >
                        {initials(personName(t.assigned_to))}
                      </span>
                    )}
                    {t.due_date && (
                      <span className="text-[11px] text-muted">{formatDate(t.due_date)}</span>
                    )}
                    <span className="ml-auto flex items-center gap-2.5 text-[11px] text-muted">
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
          <div className="overflow-hidden rounded border border-border bg-surface">
            {tasks.length === 0 && (
              <p className="py-8 text-center text-sm text-muted">No tasks yet.</p>
            )}
            {tasks.map((t) => (
              <div
                key={t.id}
                className="group flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-0 hover:bg-white/[0.03]"
              >
                <StatusPicker
                  value={t.status}
                  options={TASK_STATUSES}
                  onChange={(status) => updateTask(t.id, { status })}
                />
                <button
                  onClick={() => setDetailTaskId(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm hover:underline",
                      (t.status === "Done" || t.status === "Archived") &&
                        "text-muted line-through decoration-muted-2"
                    )}
                  >
                    {t.name}
                  </span>
                  {t.label && <LabelChip label={t.label} />}
                  {Array.isArray(t.links) && t.links.length > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                      <Link2 className="h-3 w-3" /> {t.links.length}
                    </span>
                  )}
                </button>
                {t.assigned_to && (
                  <span
                    title={personName(t.assigned_to) ?? undefined}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[9px] font-semibold text-accent"
                  >
                    {initials(personName(t.assigned_to))}
                  </span>
                )}
                <div className="w-40 shrink-0">
                  <DatePicker
                    align="right"
                    value={t.due_date}
                    placeholder="Due date"
                    onChange={(d) => updateTask(t.id, { due_date: d })}
                  />
                </div>
                <Popover
                  align="right"
                  trigger={
                    <button className="rounded p-1 text-muted opacity-0 hover:bg-white/5 hover:text-foreground group-hover:opacity-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  }
                >
                  {(close) => (
                    <>
                      <MenuLabel>Assign to</MenuLabel>
                      <MenuItem selected={!t.assigned_to} onClick={() => { updateTask(t.id, { assigned_to: null }); close(); }}>
                        Unassigned
                      </MenuItem>
                      {profiles.map((p) => (
                        <MenuItem
                          key={p.id}
                          selected={t.assigned_to === p.id}
                          onClick={() => { updateTask(t.id, { assigned_to: p.id }); close(); }}
                        >
                          {p.full_name}
                        </MenuItem>
                      ))}
                      <MenuItem
                        danger
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => { close(); deleteTask(t.id); }}
                      >
                        Delete task
                      </MenuItem>
                    </>
                  )}
                </Popover>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ CALENDAR ============ */}
      {tab === "calendar" && <ProjectCalendar tasks={active} onQuickAdd={quickAdd} />}

      {/* Task detail */}
      <TaskDetailDrawer
        task={tasks.find((t) => t.id === detailTaskId) ?? null}
        profiles={profiles}
        onClose={() => setDetailTaskId(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
      />
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
  const color = pct >= 100 ? "var(--success)" : "var(--accent)";
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
      <text x="60" y="76" textAnchor="middle" fill="var(--muted)" fontSize="9">
        completed
      </text>
    </svg>
  );
}

function StatusCount({ count, label, dotClass }: { count: number; label: string; dotClass: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{count}</p>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} /> {label}
      </p>
    </div>
  );
}

function MiniCalendar({ tasks }: { tasks: ProjectTask[] }) {
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

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Calendar</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-medium">{format(month, "MMM yyyy")}</span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-medium text-muted-2">{d}</span>
        ))}
        {grid.map((day) => {
          const hasDue = dueDays.has(format(day, "yyyy-MM-dd"));
          return (
            <span
              key={day.toISOString()}
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs",
                isToday(day)
                  ? "bg-accent font-semibold text-accent-foreground"
                  : hasDue
                    ? "bg-accent/20 font-medium text-foreground"
                    : isSameMonth(day, month)
                      ? "text-foreground"
                      : "text-muted-2"
              )}
            >
              {format(day, "d")}
              {hasDue && !isToday(day) && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent" />
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
  onQuickAdd,
}: {
  tasks: ProjectTask[];
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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setMonth((m) => subMonths(m, 1))}
            className="rounded p-1.5 text-muted hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="rounded p-1.5 text-muted hover:bg-white/5 hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const dayTasks = tasksOn(day);
            const isSelected = !!selected && isSameDay(day, selected);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelected(isSelected ? null : day)}
                className={cn(
                  "flex h-20 flex-col items-stretch gap-0.5 overflow-hidden rounded border p-1 text-left transition-colors",
                  isSelected
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:bg-white/5",
                  !isSameMonth(day, month) && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "self-end text-xs",
                    isToday(day)
                      ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground"
                      : "px-1 text-muted"
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayTasks.slice(0, 2).map((t) => (
                  <span
                    key={t.id}
                    className="truncate rounded px-1 py-px text-[10px] font-medium text-white"
                    style={{
                      background: "var(--event-indigo-bg)",
                      boxShadow: "inset 2px 0 0 0 var(--event-indigo-bar)",
                    }}
                  >
                    {t.name}
                  </span>
                ))}
                {dayTasks.length > 2 && (
                  <span className="px-1 text-[10px] text-muted">+{dayTasks.length - 2}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-muted">
          {selected ? format(selected, "MMMM d, yyyy") : "Tasks with due dates"}
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

        <div className="flex flex-col divide-y divide-border-subtle">
          {(selected ? tasksOn(selected) : tasks.filter((t) => t.due_date)).length === 0 && (
            <p className="py-6 text-center text-sm text-muted">No tasks here.</p>
          )}
          {(selected
            ? tasksOn(selected)
            : tasks
                .filter((t) => t.due_date)
                .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
          ).map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 py-2.5">
              <Badge tone={statusTone(t.status)} dot>{t.status}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
              <span className="shrink-0 text-xs text-muted">{formatDate(t.due_date)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- Tasks timeline ---------------------------------- */

const TIMELINE_COLORS = ["#a855f7", "#4cb782", "#6c74dd", "#4ea7e0", "#d9a53f", "#d95c8a"];

/** Gantt-style strip: bars run created → due inside a 12-day window around today. */
function TasksTimeline({ tasks }: { tasks: ProjectTask[] }) {
  const windowStart = startOfDay(addDays(new Date(), -5));
  const spanMs = 12 * 86_400_000;
  const rows = tasks
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 6);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Give tasks due dates and they&apos;ll appear here as a timeline.
      </p>
    );
  }

  const pct = (d: Date) =>
    Math.min(Math.max((d.getTime() - windowStart.getTime()) / spanMs, 0), 1) * 100;
  const todayPct = pct(new Date());

  return (
    <div className="relative pt-1">
      {/* Today line */}
      <div
        className="pointer-events-none absolute bottom-7 top-0 z-10 w-px bg-accent"
        style={{ left: `${todayPct}%` }}
      >
        <span className="absolute -left-[3px] -top-1 h-2 w-2 rounded-full border-2 border-accent bg-panel" />
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((t, i) => {
          const start = pct(startOfDay(parseISO(t.created_at)));
          const end = pct(addDays(startOfDay(parseISO(t.due_date as string)), 1));
          const left = Math.min(start, 90);
          const width = Math.max(end - left, 10);
          const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
          return (
            <div key={t.id} className="relative h-7 border-b border-dashed border-border-subtle">
              <div
                title={`${t.name} — due ${formatDate(t.due_date)}`}
                className={cn(
                  "absolute top-0 flex h-6 items-center overflow-hidden rounded-full px-2.5 text-[11px] font-medium text-white shadow-sm",
                  t.status === "Done" && "opacity-60"
                )}
                style={{ left: `${left}%`, width: `${width}%`, background: color }}
              >
                <span className="truncate">{t.name}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted-2">
        {Array.from({ length: 7 }, (_, i) => addDays(windowStart, i * 2)).map((d) => (
          <span key={d.getTime()}>{format(d, "d")}</span>
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
  "bg-accent/15 text-accent",
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
          : "text-muted hover:bg-white/5 hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
