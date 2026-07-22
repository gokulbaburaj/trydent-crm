"use client";

import { useMemo, useState } from "react";
import { endOfWeek, isBefore, isToday, parseISO, startOfDay } from "date-fns";
import { FolderKanban, ListChecks } from "lucide-react";
import { toast } from "@/components/Toaster";
import { Badge } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { PriorityFlag } from "@/components/ui/PriorityPicker";
import { RecurrenceIndicator } from "@/components/ui/RecurrencePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { TaskDetailDrawer } from "@/components/TaskDetailDrawer";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { nextTaskPayload } from "@/lib/recurrence";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { Profile, Project, ProjectTask } from "@/lib/types";
import { PRIORITY_ORDER, TASK_STATUSES } from "@/lib/types";

type Bucket = "Overdue" | "Today" | "This Week" | "Later";

const BUCKETS: Bucket[] = ["Overdue", "Today", "This Week", "Later"];

function bucketOf(t: ProjectTask): Bucket {
  if (!t.due_date) return "Later";
  const due = startOfDay(parseISO(t.due_date));
  const today = startOfDay(new Date());
  if (isBefore(due, today)) return "Overdue";
  if (isToday(due)) return "Today";
  if (!isBefore(endOfWeek(today, { weekStartsOn: 1 }), due)) return "This Week";
  return "Later";
}

export default function MyWorkPage() {
  const { profile } = useAuth();
  const { openInNewTab } = useTabs();
  const { rows: allTasks, setRows: setTasks, loading } = useSupabaseTable<ProjectTask>(
    "project_tasks",
    { column: "due_date", ascending: true }
  );
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const mine = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          t.assigned_to === profile?.id &&
          t.status !== "Done" &&
          t.status !== "Archived"
      ),
    [allTasks, profile]
  );

  const grouped = useMemo(() => {
    const map = new Map<Bucket, ProjectTask[]>();
    for (const b of BUCKETS) map.set(b, []);
    for (const t of mine) map.get(bucketOf(t))!.push(t);
    for (const b of BUCKETS) {
      map.get(b)!.sort(
        (a, b2) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b2.priority] ||
          (a.due_date ?? "9999").localeCompare(b2.due_date ?? "9999")
      );
    }
    return map;
  }, [mine]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  async function updateTask(id: string, patch: Partial<ProjectTask>) {
    const before = allTasks.find((t) => t.id === id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("project_tasks").update(patch).eq("id", id);
    if (
      before &&
      before.recurrence !== "none" &&
      before.status !== "Done" &&
      patch.status === "Done"
    ) {
      await spawnNext({ ...before, ...patch });
    }
  }

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

  if (loading) return <TableSkeleton rows={8} />;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">My Work</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {mine.length === 0
            ? "All clear — nothing assigned to you right now."
            : `${mine.length} open task${mine.length === 1 ? "" : "s"} assigned to you across ${
                new Set(mine.map((t) => t.project_id)).size
              } project${new Set(mine.map((t) => t.project_id)).size === 1 ? "" : "s"}.`}
        </p>
      </div>

      {mine.length === 0 && (
        <EmptyState
          icon={ListChecks}
          title="Nothing on your plate"
          description="Tasks assigned to you will collect here, grouped by when they're due."
        />
      )}

      {BUCKETS.map((bucket) => {
        const items = grouped.get(bucket)!;
        if (items.length === 0) return null;
        return (
          <section key={bucket}>
            <h3
              className={cn(
                "mb-2 flex items-center gap-2 text-[13px] font-semibold",
                bucket === "Overdue" ? "text-danger" : "text-foreground-secondary"
              )}
            >
              {bucket}
              <span className="rounded-full bg-white/5 px-1.5 py-px text-[11px] font-normal text-muted-foreground">
                {items.length}
              </span>
            </h3>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {items.map((t, i) => (
                <div
                  key={t.id}
                  style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                  className="animate-row group flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-0 hover:bg-white/[0.03]"
                >
                  <PriorityFlag priority={t.priority} showNormal />
                  <StatusPicker
                    value={t.status}
                    options={TASK_STATUSES}
                    onChange={(status) => updateTask(t.id, { status })}
                  />
                  <button
                    onClick={() => setDetailTaskId(t.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm hover:underline"
                  >
                    <span className="min-w-0 truncate">{t.name}</span>
                    <RecurrenceIndicator recurrence={t.recurrence} />
                  </button>
                  <button
                    onClick={() => openInNewTab(`/projects/${t.project_id}`, projectName(t.project_id))}
                    className="hidden shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:flex"
                  >
                    <FolderKanban className="h-3 w-3" />
                    {projectName(t.project_id)}
                  </button>
                  {t.due_date && (
                    <Badge tone={bucket === "Overdue" ? "red" : "gray"}>
                      {formatDate(t.due_date)}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <TaskDetailDrawer
        task={allTasks.find((t) => t.id === detailTaskId) ?? null}
        profiles={profiles}
        onClose={() => setDetailTaskId(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onSkip={skipTask}
      />
    </div>
  );
}
