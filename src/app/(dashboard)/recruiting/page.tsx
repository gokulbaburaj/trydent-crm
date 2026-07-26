"use client";

import { useMemo, useState } from "react";
import { ExternalLink, ListChecks, Plus, Trash2, UserPlus } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type {
  Applicant,
  ApplicantStage,
  OnboardingTask,
  OnboardingTemplate,
  OnboardingTemplateItem,
  Profile,
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
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [templateName, setTemplateName] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});

  const staff = useMemo(() => profiles.filter((p) => p.role !== "client"), [profiles]);

  const tasksByProfile = useMemo(() => {
    const map = new Map<string, OnboardingTask[]>();
    for (const t of tasks) {
      const list = map.get(t.profile_id);
      if (list) list.push(t);
      else map.set(t.profile_id, [t]);
    }
    return map;
  }, [tasks]);

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

  async function toggleTask(task: OnboardingTask) {
    const before = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t))
    );
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_tasks")
      .update({ done: !task.done })
      .eq("id", task.id);
    if (error) setTasks(before);
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Templates */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Checklist templates</h3>
        <p className="-mt-2 text-xs text-muted-foreground">
          The default template is copied onto every new team member automatically. Editing a
          template never changes a checklist already in progress.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTemplate();
          }}
          className="flex items-center gap-2"
        >
          <Input
            placeholder="Standard onboarding"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={!templateName.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>

        {templates.length === 0 && (
          <p className="text-xs text-muted-foreground">No templates yet.</p>
        )}

        {templates.map((t) => {
          const tItems = items.filter((i) => i.template_id === t.id);
          return (
            <Card key={t.id} className="rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.name}</span>
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

              <div className="mt-2.5 flex flex-col gap-1">
                {tItems.map((i) => (
                  <div
                    key={i.id}
                    className="group flex items-center gap-2 rounded-md border border-border-subtle px-2.5 py-1.5"
                  >
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
      </div>

      {/* Per-hire checklists */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">New hires</h3>
        <p className="-mt-2 text-xs text-muted-foreground">
          Everyone with an open checklist. People finish and drop off this list.
        </p>

        {staff.filter((p) => (tasksByProfile.get(p.id) ?? []).length > 0).length === 0 && (
          <p className="text-xs text-muted-foreground">
            No checklists yet. Set a default template, then add a team member.
          </p>
        )}

        {staff.map((p) => {
          const pTasks = tasksByProfile.get(p.id) ?? [];
          if (pTasks.length === 0) return null;
          const done = pTasks.filter((t) => t.done).length;
          const pct = Math.round((done / pTasks.length) * 100);
          return (
            <Card key={p.id} className="rounded-xl shadow-sm">
              <div className="flex items-center gap-2.5">
                <Avatar name={p.full_name} url={p.avatar_url} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {p.full_name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {done}/{pTasks.length}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 100 ? "bg-success" : "bg-primary"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2.5 flex flex-col gap-1">
                {pTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-white/[0.03]"
                  >
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTask(t)}
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className={cn("min-w-0 truncate", t.done && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
