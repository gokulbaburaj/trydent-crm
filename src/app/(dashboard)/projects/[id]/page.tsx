"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Box,
  CalendarDays,
  ChevronRight,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { Input } from "@/components/ui/Input";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate, initials } from "@/lib/utils";
import { useTabs } from "@/lib/tabs";
import type { Client, Profile, Project, ProjectTask, TaskStatus } from "@/lib/types";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";

type TaskView = "list" | "board";

const BOARD_STATUSES: TaskStatus[] = ["Not Started", "In Progress", "Done"];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const { setTitle } = useTabs();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [taskView, setTaskView] = useState<TaskView>("list");
  const [newTask, setNewTask] = useState("");

  const { rows: allTasks, setRows: setTasks } = useSupabaseTable<ProjectTask>(
    "project_tasks",
    { column: "created_at", ascending: true }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

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
  const completion = active.length > 0 ? (done.length / active.length) * 100 : 0;

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

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const name = newTask.trim();
    if (!name) return;
    setNewTask("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_tasks")
      .insert({ project_id: projectId, name, status: "Not Started", sort_order: tasks.length })
      .select()
      .single();
    if (!error && data) setTasks((prev) => [...prev, data as ProjectTask]);
  }

  async function updateTask(id: string, patch: Partial<ProjectTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("project_tasks").update(patch).eq("id", id);
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("project_tasks").delete().eq("id", id);
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
    <div className="-m-6 flex min-h-full">
      {/* ============ Main column ============ */}
      <div className="min-w-0 flex-1 px-8 py-6">
        {/* Breadcrumb */}
        <div className="mb-8 flex items-center gap-1 text-[13px] text-muted">
          <Link
            href="/projects"
            className="rounded px-1 py-0.5 hover:bg-white/5 hover:text-foreground"
          >
            Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{project.name}</span>
        </div>

        {/* Icon + title */}
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-md bg-accent/15">
          <Box className="h-5 w-5 text-accent" />
        </div>
        <h1 className="mt-3 text-[26px] font-semibold tracking-tight">{project.name}</h1>

        {/* Inline properties row */}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-[13px] text-muted">Properties</span>
          <div className="flex flex-wrap items-center gap-1.5 pl-2">
            <StatusPicker
              value={project.status}
              options={PROJECT_STATUSES}
              onChange={(status) => updateProject({ status })}
            />
            <span className="inline-flex items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary">
              <CalendarDays className="h-3 w-3 text-muted" />
              {project.start_date ? formatDate(project.start_date) : "Start"}
              <span className="text-muted">→</span>
              {project.due_date ? formatDate(project.due_date) : "Target"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary">
              {clientName(project.client_id)}
            </span>
          </div>
        </div>

        {/* Description */}
        <div className="mt-8">
          <h3 className="mb-2 text-[13px] font-medium text-muted">Description</h3>
          <textarea
            rows={3}
            placeholder="Add a short summary..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (project.description ?? "")) {
                updateProject({ description });
              }
            }}
            className="w-full resize-none rounded border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-2 hover:border-border focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        {/* Tasks */}
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Project tasks</h3>
            <div className="flex items-center gap-0.5 rounded border border-border bg-surface p-0.5">
              <ViewButton active={taskView === "list"} onClick={() => setTaskView("list")} icon={List} label="List" />
              <ViewButton active={taskView === "board"} onClick={() => setTaskView("board")} icon={LayoutGrid} label="Board" />
            </div>
          </div>

          <form onSubmit={addTask} className="flex items-center gap-2">
            <Input
              placeholder="New task..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={!newTask.trim()}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>

          {taskView === "list" ? (
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
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      t.status === "Done" || t.status === "Archived"
                        ? "text-muted line-through decoration-muted-2"
                        : ""
                    }`}
                  >
                    {t.name}
                  </span>
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
          ) : (
            <KanbanBoard
              columns={BOARD_STATUSES.map((s) => ({ id: s, label: s }))}
              items={tasks.filter((t) => t.status !== "Archived")}
              getColumnId={(t) => t.status}
              onMove={(t, status) => updateTask(t.id, { status: status as TaskStatus })}
              renderCard={(t) => (
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {t.due_date && (
                      <span className="text-xs text-muted">{formatDate(t.due_date)}</span>
                    )}
                    {t.assigned_to && (
                      <Badge tone="gray">{personName(t.assigned_to)}</Badge>
                    )}
                  </div>
                </div>
              )}
            />
          )}
        </div>
      </div>

      {/* ============ Right properties panel ============ */}
      <aside className="hidden w-72 shrink-0 border-l border-border px-4 py-5 lg:block">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-foreground-secondary">Properties</h3>
          <Popover
            align="right"
            trigger={
              <button className="rounded p-1 text-muted hover:bg-white/5 hover:text-foreground">
                <MoreHorizontal className="h-3.5 w-3.5" />
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

        <div className="mt-3 flex flex-col gap-3.5">
          <SideRow label="Status">
            <StatusPicker
              align="right"
              value={project.status}
              options={PROJECT_STATUSES}
              onChange={(status) => updateProject({ status })}
            />
          </SideRow>

          <SideRow label="Lead">
            <Popover
              align="right"
              trigger={
                <button className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-white/5">
                  {project.owner ? (
                    <>
                      <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent/15 text-[8px] font-semibold text-accent">
                        {initials(personName(project.owner))}
                      </span>
                      {personName(project.owner)}
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 text-muted" />
                      <span className="text-muted">Unassigned</span>
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
          </SideRow>

          <SideRow label="Client">
            <span className="px-1.5 text-[13px]">{clientName(project.client_id)}</span>
          </SideRow>

          <SideRow label="Start">
            <DatePicker
              align="right"
              value={project.start_date}
              placeholder="Start date"
              onChange={(d) => updateProject({ start_date: d })}
            />
          </SideRow>

          <SideRow label="Target">
            <DatePicker
              align="right"
              value={project.due_date}
              placeholder="Target date"
              onChange={(d) => updateProject({ due_date: d })}
            />
          </SideRow>
        </div>

        {/* Progress */}
        <div className="mt-6 border-t border-border-subtle pt-4">
          <h3 className="text-[13px] font-medium text-foreground-secondary">Progress</h3>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums">{completion.toFixed(0)}%</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {done.length} of {active.length} tasks completed
          </p>
        </div>

        {/* Activity */}
        <div className="mt-6 border-t border-border-subtle pt-4">
          <h3 className="text-[13px] font-medium text-foreground-secondary">Activity</h3>
          <p className="mt-2.5 text-xs text-muted">
            Project created · {formatDate(project.created_at)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Last updated · {formatDate(project.updated_at)}
          </p>
        </div>
      </aside>
    </div>
  );
}

function SideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-16 shrink-0 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 justify-start">{children}</div>
    </div>
  );
}

function ViewButton({
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
