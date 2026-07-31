"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  CircleDot,
  ListChecks,
  Plus,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DatePicker } from "@/components/ui/DatePicker";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input, Label } from "@/components/ui/Input";
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
  ProfileEmail,
  Role,
} from "@/lib/types";
import { ONBOARDING_SECTIONS } from "@/lib/types";

/** Steps bucketed by phase, phases in canonical order. */
function groupBySection<T extends { section: string }>(rows: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.section);
    if (list) list.push(r);
    else map.set(r.section, [r]);
  }
  const known = ONBOARDING_SECTIONS.filter((s) => map.has(s));
  const extra = Array.from(map.keys()).filter(
    (s) => !(ONBOARDING_SECTIONS as readonly string[]).includes(s)
  );
  return [...known, ...extra].map((s) => [s, map.get(s)!]);
}

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
  const { rows: staff, setRows: setStaff } = useStaffProfiles();
  // Emails moved to their own staff-only table so profiles could stay readable
  // by the client portal without carrying an address.
  const { rows: emailRows } = useSupabaseTable<ProfileEmail>("profile_emails");
  const emailOf = (id: string | undefined) =>
    id ? emailRows.find((e) => e.profile_id === id)?.email ?? null : null;
  const { rows: roles } = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });
  const roleOf = (id: string | null | undefined) =>
    roles.find((r) => r.id === id) ?? null;

  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [stepDraft, setStepDraft] = useState("");
  const [stepSection, setStepSection] = useState<string>(ONBOARDING_SECTIONS[0]);
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

  /**
   * Built from the TASKS, not from the staff list.
   *
   * The other way round silently dropped anyone whose profile didn't come back
   * in the same query — a new hire created seconds earlier, or someone the
   * profile filter excluded. If a checklist exists, its owner belongs on this
   * page, even if all we can show is "Unknown member".
   */
  const people = useMemo(
    () =>
      Array.from(tasksByProfile.entries())
        .map(([profileId, list]) => {
          const done = list.filter((t) => t.done).length;
          return {
            profileId,
            profile: staff.find((p) => p.id === profileId) ?? null,
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
          section: s.section,
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

  /** Ad-hoc step for one person — not everything belongs in the template. */
  async function addStep(profileId: string) {
    const title = stepDraft.trim();
    if (!title) return;
    const existing = tasksByProfile.get(profileId) ?? [];
    const section = stepSection;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("onboarding_tasks")
      .insert({ profile_id: profileId, title, section, sort_order: existing.length })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setTasks((prev) => [...prev, data as OnboardingTask]);
    setStepDraft("");
  }

  async function deleteStep(id: string) {
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("onboarding_tasks").delete().eq("id", id);
    if (error) setTasks(before);
  }

  /** Job title and start date live on the profile so they show up everywhere,
   *  not just here. */
  async function updateProfile(id: string, patch: { title?: string; start_date?: string | null }) {
    setStaff((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
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
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Title lives in the topbar. */}
          <p className="text-sm text-muted-foreground">
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
            {inProgress.map(({ profileId, profile, tasks: pTasks, done, pct }) => {
              const name = profile?.full_name ?? "Unknown member";
              const next = pTasks.find((t) => !t.done);
              return (
                <Card
                  key={profileId}
                  onClick={() => setOpenPerson(profileId)}
                  className="lift cursor-pointer rounded-xl shadow-sm hover:border-primary/30"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={name} url={profile?.avatar_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{name}</p>
                      <p className="text-[11px] text-muted-2">
                        {done} of {pTasks.length} done
                        {roleOf(profile?.role_id)?.name
                          ? ` · ${roleOf(profile?.role_id)?.name}`
                          : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Just what's next on the card — the full list is one click
                      away, and a wall of steps per person makes the page
                      unscannable once you have three or four hires. */}
                  {next && (
                    <p className="mt-2.5 truncate text-[12px] text-foreground-secondary">
                      Next: {next.title}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {finished.length > 0 && (
        <div>
          <h3 className="mb-2.5 text-sm font-semibold">Fully onboarded</h3>
          <div className="flex flex-wrap gap-2">
            {finished.map(({ profileId, profile, tasks: pTasks }) => (
              <button
                key={profileId}
                type="button"
                onClick={() => setOpenPerson(profileId)}
                className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 py-1 pl-1 pr-3 transition-colors hover:bg-success/20"
              >
                <Avatar name={profile?.full_name ?? "Unknown"} url={profile?.avatar_url} size="xs" />
                <span className="text-[13px]">{profile?.full_name ?? "Unknown member"}</span>
                <span className="text-[11px] text-success">
                  {pTasks.length}/{pTasks.length}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* One person's full onboarding */}
      <Drawer
        open={!!openPerson}
        onClose={() => {
          setOpenPerson(null);
          setStepDraft("");
        }}
        title={
          people.find((p) => p.profileId === openPerson)?.profile?.full_name ??
          "Onboarding"
        }
        wide
      >
        {(() => {
          const entry = people.find((p) => p.profileId === openPerson);
          if (!entry) return null;
          const { profileId, profile, tasks: pTasks, done, pct } = entry;
          const personRole = roleOf(profile?.role_id);
          const welcome =
            (personRole?.template_id
              ? templates.find((t) => t.id === personRole.template_id)
              : defaultTemplate ?? templates[0]
            )?.welcome_note ?? null;
          return (
            <div className="flex flex-col gap-4">
              {/* Reads like a document: title, a property table, then the
                  checklist grouped into phases. */}
              <div className="flex items-center gap-3">
                <Avatar name={profile?.full_name ?? "Unknown"} url={profile?.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold tracking-tight">
                    {profile?.full_name ?? "Unknown member"}
                  </p>
                  <p className="text-[11px] text-muted-2">{emailOf(profile?.id)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums">{pct}%</p>
                  <p className="text-[11px] text-muted-2">
                    {done} of {pTasks.length}
                  </p>
                </div>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 100 ? "bg-success" : "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <PropRow icon={CircleDot} label="Status">
                  <Badge tone={pct >= 100 ? "green" : pct > 0 ? "yellow" : "gray"}>
                    {pct >= 100 ? "Complete" : pct > 0 ? "In progress" : "Not started"}
                  </Badge>
                </PropRow>
                <PropRow icon={Briefcase} label="Position">
                  {/* The role IS the position — one list, managed in Settings. */}
                  <span className="text-[13px] text-foreground-secondary">
                    {roleOf(profile?.role_id)?.name ?? "No role set"}
                  </span>
                </PropRow>
                <PropRow icon={CalendarDays} label="Start date">
                  <div className="w-44">
                    <DatePicker
                      value={profile?.start_date ?? null}
                      placeholder="Not set"
                      onChange={(d) => profile && updateProfile(profile.id, { start_date: d })}
                    />
                  </div>
                </PropRow>
                <PropRow icon={UsersRound} label="Team">
                  <span className="text-[13px] text-foreground-secondary">
                    {roleOf(profile?.role_id)?.team ?? profile?.team ?? "No team"}
                  </span>
                </PropRow>
              </div>

              {welcome && (
                <div className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-[13px] leading-relaxed text-foreground-secondary">
                  {welcome}
                </div>
              )}

              <div className="flex flex-col gap-4">
                {groupBySection(pTasks).map(([section, sectionTasks]) => (
                  <div key={section}>
                    <h4 className="mb-1.5 text-[13px] font-semibold">{section}</h4>
                    <div className="flex flex-col gap-1">
                {sectionTasks.map((t, i) => (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:border-white/15"
                  >
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-2">
                      {i + 1}
                    </span>
                    <Checkbox
                      checked={t.done}
                      onChange={() => toggleTask(t)}
                      className="min-w-0 flex-1"
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
                    <button
                      type="button"
                      aria-label={`Remove ${t.title}`}
                      onClick={() => deleteStep(t.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                    </div>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addStep(profileId);
                }}
                className="flex items-center gap-2"
              >
                <div className="w-36 shrink-0">
                  <Dropdown
                    value={stepSection}
                    options={ONBOARDING_SECTIONS.map((sn) => ({ value: sn, label: sn }))}
                    onChange={setStepSection}
                  />
                </div>
                <Input
                  placeholder="Add a step just for this person..."
                  value={stepDraft}
                  onChange={(e) => setStepDraft(e.target.value)}
                />
                <Button type="submit" size="sm" variant="secondary" disabled={!stepDraft.trim()}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>

              <div className="flex justify-end border-t border-border-subtle pt-3">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    clearChecklist(profileId);
                    setOpenPerson(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear checklist
                </Button>
              </div>
            </div>
          );
        })()}
      </Drawer>

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
              onChange={(v) => {
                setStartPerson(v);
                // Pre-select the checklist their role calls for.
                const r = roleOf(staff.find((p) => p.id === v)?.role_id);
                if (r?.template_id) setStartTemplate(r.template_id);
              }}
            />
            {startPerson && roleOf(staff.find((p) => p.id === startPerson)?.role_id) && (
              <p className="mt-1 text-[11px] text-muted-2">
                Role: {roleOf(staff.find((p) => p.id === startPerson)?.role_id)?.name}
              </p>
            )}
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

/** One property line in the person document — icon, label, value. */
function PropRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-32 shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
