"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListChecks, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type {
  OnboardingTask,
  OnboardingTemplate,
  OnboardingTemplateItem,
} from "@/lib/types";

/**
 * Onboarding — the live process, one card per person.
 *
 * Templates live on the Recruiting page: those are the *guideline*, the shape a
 * new hire's first weeks should take. This page is the actual run of that
 * guideline against real people, which is a different job and deserves its own
 * place rather than a tab buried in a hiring tool.
 */
export default function OnboardingPage() {
  return (
    <RequireAccess page="onboarding">
      <OnboardingInner />
    </RequireAccess>
  );
}

function OnboardingInner() {
  const { rows: tasks, setRows: setTasks, loading } = useSupabaseTable<OnboardingTask>(
    "onboarding_tasks",
    { column: "sort_order", ascending: true }
  );
  const { rows: templates } = useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: items } = useSupabaseTable<OnboardingTemplateItem>(
    "onboarding_template_items",
    { column: "sort_order", ascending: true }
  );
  const { rows: staff } = useStaffProfiles();

  const [startOpen, setStartOpen] = useState(false);
  const [startPerson, setStartPerson] = useState("");
  const [startTemplate, setStartTemplate] = useState("");
  const [startBusy, setStartBusy] = useState(false);

  const tasksByProfile = useMemo(() => {
    const map = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const list = map.get(t.profile_id);
      if (list) list.push(t);
      else map.set(t.profile_id, [t]);
    }
    return map;
  }, [tasks]);

  const people = useMemo(
    () =>
      staff
        .filter((p) => (tasksByProfile.get(p.id) ?? []).length > 0)
        .map((p) => {
          const list = tasksByProfile.get(p.id)!;
          const done = list.filter((t) => t.done).length;
          return {
            profile: p,
            tasks: list,
            done,
            pct: Math.round((done / list.length) * 100),
          };
        })
        .sort((a, b) => a.pct - b.pct),
    [staff, tasksByProfile]
  );

  const inProgress = people.filter((p) => p.pct < 100);
  const finished = people.filter((p) => p.pct >= 100);
  const defaultTemplate = templates.find((t) => t.is_default) ?? null;

  async function startOnboarding() {
    if (!startPerson || !startTemplate) return;
    const steps = items.filter((i) => i.template_id === startTemplate);
    if (steps.length === 0) {
      toast.error("That template has no steps yet.");
      return;
    }
    setStartBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setStartBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("onboarding_tasks")
      .insert(
        steps.map((s) => ({
          profile_id: startPerson,
          title: s.title,
          sort_order: s.sort_order,
        }))
      )
      .select();
    setStartBusy(false);
    if (error || !data) {
      toast.error(`Couldn't start: ${error?.message ?? "unknown error"}`);
      return;
    }
    setTasks((prev) => [...prev, ...(data as OnboardingTask[])]);
    setStartOpen(false);
    setStartPerson("");
    toast.success("Checklist started");
  }

  async function toggleTask(task: OnboardingTask) {
    const before = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_tasks")
      .update({ done: !task.done })
      .eq("id", task.id);
    if (error) setTasks(before);
  }

  async function clearChecklist(profileId: string) {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.profile_id !== profileId));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_tasks")
      .delete()
      .eq("profile_id", profileId);
    if (error) {
      setTasks(before);
      toast.error(`Couldn't clear: ${error.message}`);
    }
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Onboarding</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everyone still finding their feet, and how far along they are.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/recruiting"
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            Edit templates <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Button
            size="sm"
            disabled={templates.length === 0 || staff.length === 0}
            onClick={() => {
              setStartTemplate(defaultTemplate?.id ?? templates[0]?.id ?? "");
              setStartOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Start onboarding
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-semibold">
          In progress
          <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {inProgress.length}
          </span>
        </h3>
        {inProgress.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nobody is onboarding right now"
            description={
              templates.length === 0
                ? "Create a checklist template on the Recruiting page, then start it for someone."
                : "Hiring someone from Recruiting offers to start this automatically, or use Start onboarding."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {inProgress.map(({ profile, tasks: pTasks, done, pct }) => (
              <Card key={profile.id} className="rounded-xl shadow-sm">
                <div className="flex items-center gap-2.5">
                  <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{profile.full_name}</p>
                    <p className="text-[11px] text-muted-2">
                      {done} of {pTasks.length} done
                      {profile.team ? ` · ${profile.team}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Clear ${profile.full_name}'s checklist`}
                    onClick={() => clearChecklist(profile.id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2.5 flex flex-col gap-0.5">
                  {pTasks.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-md px-1 py-1 transition-colors hover:bg-white/[0.03]"
                    >
                      <Checkbox
                        checked={t.done}
                        onChange={() => toggleTask(t)}
                        label={
                          <span
                            className={cn(
                              "min-w-0 text-[13px]",
                              t.done && "text-muted-foreground line-through"
                            )}
                          >
                            {t.title}
                          </span>
                        }
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-sm font-semibold">Fully onboarded</h3>
          <div className="flex flex-wrap gap-2">
            {finished.map(({ profile, tasks: pTasks }) => (
              <div
                key={profile.id}
                className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 py-1 pl-1 pr-3"
              >
                <Avatar name={profile.full_name} url={profile.avatar_url} size="xs" />
                <span className="text-[13px]">{profile.full_name}</span>
                <span className="text-[11px] text-success">
                  {pTasks.length}/{pTasks.length}
                </span>
                <button
                  type="button"
                  aria-label={`Clear ${profile.full_name}'s checklist`}
                  onClick={() => clearChecklist(profile.id)}
                  className="text-muted-foreground transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Drawer open={startOpen} onClose={() => setStartOpen(false)} title="Start onboarding">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startOnboarding();
          }}
          className="flex flex-col gap-4"
        >
          <div>
            <Label>Who</Label>
            <Dropdown
              value={startPerson}
              placeholder="Choose a team member"
              options={staff.map((p) => ({ value: p.id, label: p.full_name }))}
              onChange={setStartPerson}
            />
            {startPerson && (tasksByProfile.get(startPerson)?.length ?? 0) > 0 && (
              <p className="mt-1 text-[11px] text-warning">
                This person already has a checklist. Starting another adds its steps on top.
              </p>
            )}
          </div>
          <div>
            <Label>Template</Label>
            <Dropdown
              value={startTemplate}
              placeholder="Choose a template"
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.name} (${items.filter((i) => i.template_id === t.id).length} steps)`,
              }))}
              onChange={setStartTemplate}
            />
          </div>
          <Button type="submit" disabled={startBusy || !startPerson || !startTemplate}>
            {startBusy ? "Starting..." : "Start checklist"}
          </Button>
        </form>
      </Drawer>

      {people.length > 0 && (
        <p className="text-[11px] text-muted-2">
          Checklists started {formatDate(tasks[0]?.created_at)} onwards.
        </p>
      )}
    </div>
  );
}
