"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ListChecks,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { KanbanBoard, type KanbanColumn } from "@/components/KanbanBoard";
import { RequireAccess } from "@/components/RequireAccess";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type {
  Applicant,
  ApplicantStage,
  OnboardingTask,
  OnboardingTemplate,
  OnboardingTemplateItem,
} from "@/lib/types";
import { APPLICANT_STAGES, APPLICANT_STAGE_LABELS } from "@/lib/types";

type Tab = "applicants" | "onboarding";

const COLUMNS: KanbanColumn[] = APPLICANT_STAGES.map((s) => ({
  id: s,
  label: APPLICANT_STAGE_LABELS[s],
}));

export default function RecruitingPage() {
  return (
    <RequireAccess page="recruiting">
      <RecruitingInner />
    </RequireAccess>
  );
}

function RecruitingInner() {
  const [tab, setTab] = useState<Tab>("applicants");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Recruiting</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Applicant pipeline and new-hire onboarding.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
          {(
            [
              ["applicants", "Applicants", UserPlus],
              ["onboarding", "Onboarding", ListChecks],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                tab === id
                  ? "bg-white/10 font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "applicants" ? <Applicants /> : <Onboarding />}
    </div>
  );
}

/* ============================ APPLICANTS ============================ */

function Applicants() {
  const { rows: applicants, setRows, loading } = useSupabaseTable<Applicant>("applicants", {
    column: "created_at",
    ascending: false,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const openApplicant = applicants.find((a) => a.id === openId) ?? null;

  const locations = useMemo(() => {
    const set = new Set(
      applicants.map((a) => a.location).filter((l): l is string => !!l && l.trim() !== "")
    );
    return Array.from(set).sort();
  }, [applicants]);

  const visible = useMemo(
    () => (locationFilter ? applicants.filter((a) => a.location === locationFilter) : applicants),
    [applicants, locationFilter]
  );

  async function addApplicant() {
    const full_name = name.trim();
    if (!full_name) return;
    let url = resumeUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setSaving(true);
    const supabase = createClient();
    if (!supabase) {
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("applicants")
      .insert({
        full_name,
        role_title: roleTitle.trim() || null,
        location: location.trim() || null,
        email: email.trim() || null,
        source: source.trim() || null,
        resume_url: url || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setRows((prev) => [data as Applicant, ...prev]);
    setName("");
    setRoleTitle("");
    setLocation("");
    setEmail("");
    setSource("");
    setResumeUrl("");
    setFormOpen(false);
  }

  async function moveApplicant(applicant: Applicant, stage: string) {
    const before = applicants;
    setRows((prev) =>
      prev.map((a) => (a.id === applicant.id ? { ...a, stage: stage as ApplicantStage } : a))
    );
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("applicants").update({ stage }).eq("id", applicant.id);
    if (error) {
      setRows(before);
      toast.error(`Couldn't move: ${error.message}`);
    }
  }

  async function updateApplicant(id: string, patch: Partial<Applicant>) {
    const before = applicants;
    setRows((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("applicants").update(patch).eq("id", id);
    if (error) {
      setRows(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteApplicant(id: string) {
    const before = applicants;
    setRows((prev) => prev.filter((a) => a.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("applicants").delete().eq("id", id);
    if (error) {
      setRows(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {locations.length > 0 && (
          <div className="w-44">
            <Dropdown
              value={locationFilter}
              options={[
                { value: "", label: "All locations" },
                ...locations.map((l) => ({ value: l, label: l })),
              ]}
              onChange={setLocationFilter}
            />
          </div>
        )}
        <Button size="sm" className="ml-auto" onClick={() => setFormOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5" /> Add applicant
        </Button>
      </div>

      {formOpen && (
        <Card className="rounded-xl shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addApplicant();
            }}
            className="flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <Input
                  placeholder="Video editor"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  placeholder="Remote"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Source</Label>
                <Input
                  placeholder="Referral"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>
              <div>
                <Label>Resume link</Label>
                <Input
                  placeholder="drive.google.com/..."
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? "Adding..." : "Add applicant"}
            </Button>
          </form>
        </Card>
      )}

      {applicants.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No applicants yet"
          description="Add someone, then drag them across the board as they move through your process."
        />
      ) : (
        <KanbanBoard
          columns={COLUMNS}
          items={visible}
          getColumnId={(a) => a.stage}
          onMove={moveApplicant}
          renderCard={(a) => (
            // The whole card opens the detail modal. dnd-kit owns pointerdown
            // for dragging, so a plain onClick is what distinguishes a click
            // from a drag (the sensor needs 5px of movement to take over).
            <div className="group cursor-pointer" onClick={() => setOpenId(a.id)}>
              <div className="flex items-start gap-2">
                <Avatar name={a.full_name} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{a.full_name}</p>
                  {a.role_title && (
                    <p className="truncate text-[11px] text-muted-foreground">{a.role_title}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-2">
                {a.location && <span>{a.location}</span>}
                {a.source && <span>· {a.source}</span>}
                <span className="ml-auto">{formatDate(a.created_at)}</span>
              </div>
            </div>
          )}
        />
      )}

      <Drawer
        open={!!openApplicant}
        onClose={() => setOpenId(null)}
        title={openApplicant?.full_name ?? ""}
      >
        {openApplicant && (
          <ApplicantDetail
            key={openApplicant.id}
            applicant={openApplicant}
            onChange={(patch) => updateApplicant(openApplicant.id, patch)}
            onDelete={() => {
              deleteApplicant(openApplicant.id);
              setOpenId(null);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/** Everything about one applicant, editable in place. Fields save on blur so
 *  there's no Save button to forget. */
function ApplicantDetail({
  applicant,
  onChange,
  onDelete,
}: {
  applicant: Applicant;
  onChange: (patch: Partial<Applicant>) => void;
  onDelete: () => void;
}) {
  // Seeded once. The caller passes a `key` of the applicant id, so opening a
  // different person remounts this component with fresh state — no effect
  // needed to re-sync, which is the React-approved way to reset on prop change.
  const [draft, setDraft] = useState(applicant);

  const commit = (key: keyof Applicant) => {
    const value = draft[key];
    if (value !== applicant[key]) onChange({ [key]: value } as Partial<Applicant>);
  };

  const field = (key: keyof Applicant, label: string, placeholder?: string) => (
    <div>
      <Label>{label}</Label>
      <Input
        placeholder={placeholder}
        value={(draft[key] as string) ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => commit(key)}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={draft.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <Label>Stage</Label>
          <div className="w-44">
            <Dropdown
              value={draft.stage}
              options={APPLICANT_STAGES.map((s) => ({
                value: s,
                label: APPLICANT_STAGE_LABELS[s],
              }))}
              onChange={(v) => {
                setDraft((d) => ({ ...d, stage: v as ApplicantStage }));
                onChange({ stage: v as ApplicantStage });
              }}
            />
          </div>
        </div>
        <span className="self-start text-[11px] text-muted-2">
          Added {formatDate(applicant.created_at)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("full_name", "Name")}
        {field("role_title", "Role", "Video editor")}
        {field("location", "Location", "Remote")}
        {field("source", "Source", "Referral")}
        {field("email", "Email")}
        {field("phone", "Phone")}
      </div>

      <div>
        <Label>Resume link</Label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="drive.google.com/..."
            value={draft.resume_url ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, resume_url: e.target.value }))}
            onBlur={() => {
              let url = (draft.resume_url ?? "").trim();
              if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
              if (url !== (applicant.resume_url ?? "")) onChange({ resume_url: url || null });
            }}
          />
          {applicant.resume_url && (
            <a
              href={applicant.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open resume"
              className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea
          rows={5}
          placeholder="Interview impressions, salary expectations, next steps..."
          value={draft.notes ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          onBlur={() => commit("notes")}
        />
      </div>

      <div className="flex justify-end border-t border-border-subtle pt-3">
        <Button type="button" variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete applicant
        </Button>
      </div>
    </div>
  );
}

/* ============================ ONBOARDING ============================ */


/**
 * Onboarding: templates on one side, real people on the other.
 *
 * The flow is deliberately spelled out on screen, because "checklist templates"
 * next to "new hires" with no connecting text told you nothing about how the
 * two relate. You build a template once, then start it for a person; from that
 * moment their copy is theirs alone and editing the template won't touch it.
 */
function Onboarding() {
  const { rows: templates, setRows: setTemplates, loading } =
    useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: items, setRows: setItems } = useSupabaseTable<OnboardingTemplateItem>(
    "onboarding_template_items",
    { column: "sort_order", ascending: true }
  );
  const { rows: tasks, setRows: setTasks } = useSupabaseTable<OnboardingTask>(
    "onboarding_tasks",
    { column: "sort_order", ascending: true }
  );
  const { rows: staff } = useStaffProfiles();

  const [templateName, setTemplateName] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [startOpen, setStartOpen] = useState(false);
  const [startPerson, setStartPerson] = useState("");
  const [startTemplate, setStartTemplate] = useState("");
  const [startBusy, setStartBusy] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);

  const tasksByProfile = useMemo(() => {
    const map = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const list = map.get(t.profile_id);
      if (list) list.push(t);
      else map.set(t.profile_id, [t]);
    }
    return map;
  }, [tasks]);

  /** Anyone with at least one step, newest checklists first. */
  const peopleOnboarding = useMemo(
    () =>
      staff
        .filter((p) => (tasksByProfile.get(p.id) ?? []).length > 0)
        .map((p) => {
          const list = tasksByProfile.get(p.id)!;
          const done = list.filter((t) => t.done).length;
          return { profile: p, tasks: list, done, pct: Math.round((done / list.length) * 100) };
        })
        .sort((a, b) => a.pct - b.pct),
    [staff, tasksByProfile]
  );

  const inProgress = peopleOnboarding.filter((p) => p.pct < 100);
  const finished = peopleOnboarding.filter((p) => p.pct >= 100);

  async function addTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("onboarding_templates")
      .insert({ name, is_default: templates.length === 0 })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Couldn't create: ${error?.message ?? "unknown error"}`);
      return;
    }
    setTemplates((prev) => [...prev, data as OnboardingTemplate]);
    setTemplateName("");
  }

  async function makeDefault(id: string) {
    setTemplates((prev) => prev.map((t) => ({ ...t, is_default: t.id === id })));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("onboarding_templates").update({ is_default: true }).eq("id", id);
  }

  async function deleteTemplate(id: string) {
    const before = templates;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
    if (error) {
      setTemplates(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
  }

  async function addItem(templateId: string) {
    const title = (itemDrafts[templateId] ?? "").trim();
    if (!title) return;
    const existing = items.filter((i) => i.template_id === templateId);
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("onboarding_template_items")
      .insert({ template_id: templateId, title, sort_order: existing.length })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setItems((prev) => [...prev, data as OnboardingTemplateItem]);
    setItemDrafts((prev) => ({ ...prev, [templateId]: "" }));
  }

  async function deleteItem(id: string) {
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("onboarding_template_items").delete().eq("id", id);
    if (error) setItems(before);
  }

  /** Copy a template's steps onto a person. This is the missing action that
   *  made the old screen feel broken — new hires only appeared if the database
   *  trigger happened to fire. */
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

  const defaultTemplate = templates.find((t) => t.is_default);

  return (
    <div className="flex flex-col gap-5">
      {/* How this works */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-[13px] text-foreground-secondary">
          Build a checklist template once, then start it for a person. Their copy is
          independent, so editing the template later never disturbs someone mid-way through.
          {defaultTemplate ? (
            <>
              {" "}
              New team members get <span className="font-medium">{defaultTemplate.name}</span>{" "}
              automatically.
            </>
          ) : (
            " Mark a template as default and new team members will get it automatically."
          )}
        </p>
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

      {/* In progress */}
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
                ? "Create a checklist template below, then start it for someone."
                : "Use Start onboarding to give someone a checklist."
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
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-white/[0.03]"
                    >
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggleTask(t)}
                        className="h-4 w-4 shrink-0 rounded accent-primary"
                      />
                      <span
                        className={cn(
                          "min-w-0 truncate",
                          t.done && "text-muted-foreground line-through"
                        )}
                      >
                        {t.title}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Finished */}
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
                <span className="text-[11px] text-success">{pTasks.length}/{pTasks.length}</span>
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

      {/* Templates */}
      <div>
        <button
          type="button"
          onClick={() => setShowTemplates((s) => !s)}
          className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold hover:text-foreground-secondary"
        >
          {showTemplates ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Checklist templates
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {templates.length}
          </span>
        </button>

        {showTemplates && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => {
              const tItems = items.filter((i) => i.template_id === t.id);
              return (
                <Card key={t.id} className="rounded-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {t.name}
                    </span>
                    {t.is_default ? (
                      <Badge tone="green">Default</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makeDefault(t.id)}
                        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                      >
                        Make default
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      onClick={() => deleteTemplate(t.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-2">
                    {tItems.length} step{tItems.length === 1 ? "" : "s"}
                  </p>

                  <div className="mt-2.5 flex flex-col gap-1">
                    {tItems.map((i, idx) => (
                      <div
                        key={i.id}
                        className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5"
                      >
                        <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-2">
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">{i.title}</span>
                        <button
                          type="button"
                          aria-label={`Delete ${i.title}`}
                          onClick={() => deleteItem(i.id)}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addItem(t.id);
                    }}
                    className="mt-2 flex items-center gap-2"
                  >
                    <Input
                      placeholder="Add a step..."
                      value={itemDrafts[t.id] ?? ""}
                      onChange={(e) =>
                        setItemDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={!(itemDrafts[t.id] ?? "").trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </form>
                </Card>
              );
            })}

            <Card className="flex flex-col justify-center rounded-xl border-dashed shadow-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addTemplate();
                }}
                className="flex flex-col gap-2"
              >
                <Label>New template</Label>
                <Input
                  placeholder="Standard onboarding"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!templateName.trim()}
                >
                  <Plus className="h-3.5 w-3.5" /> Create template
                </Button>
              </form>
            </Card>
          </div>
        )}
      </div>

      {/* Start onboarding */}
      <Drawer
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Start onboarding"
      >
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
                This person already has a checklist. Starting another will add its steps
                on top.
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
    </div>
  );
}
