"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ExternalLink,
  FileText,
  LayoutGrid,
  List,
  ListChecks,
  Mail,
  Plus,
  Star,
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
import { Checkbox } from "@/components/ui/Checkbox";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { KanbanBoard, type KanbanColumn } from "@/components/KanbanBoard";
import { RequireAccess } from "@/components/RequireAccess";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { staggerDelay } from "@/lib/motion";
import { useViewPreference } from "@/lib/useViewPreference";
import type {
  Applicant,
  ApplicantStage,
  OnboardingTemplate,
  OnboardingTemplateItem,
  Role,
} from "@/lib/types";
import {
  APPLICANT_STAGES,
  APPLICANT_STAGE_LABELS,
  ONBOARDING_SECTIONS,
  STAFF_TYPES,
  USER_ROLE_LABELS,
} from "@/lib/types";

/** Steps in template order, bucketed by phase, phases in canonical order. */
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

type Tab = "applicants" | "onboarding";

const COLUMNS: KanbanColumn[] = APPLICANT_STAGES.map((s) => ({
  id: s,
  label: APPLICANT_STAGE_LABELS[s],
}));

/** Stage is a status, not a category — it gets meaning, not a hashed hue. */
const STAGE_TONE: Record<ApplicantStage, "gray" | "blue" | "yellow" | "green" | "red"> = {
  applied: "gray",
  screening: "blue",
  interview: "yellow",
  offer: "blue",
  hired: "green",
  rejected: "red",
};

export default function RecruitingPage() {
  return (
    <RequireAccess page="recruiting">
      <RecruitingInner />
    </RequireAccess>
  );
}

function RecruitingInner() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("applicants");
  /** The applicant just dragged to Hired, awaiting a decision. */
  const [hired, setHired] = useState<Applicant | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Title lives in the topbar. */}
          <p className="text-sm text-muted-foreground">
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

      {tab === "applicants" ? <Applicants onHired={setHired} /> : <Onboarding />}

      <Drawer
        open={!!hired}
        onClose={() => setHired(null)}
        title="Hired — add them to the team?"
      >
        {hired && (
          <HireForm
            key={hired.id}
            applicant={hired}
            onDone={(goToOnboarding) => {
              setHired(null);
              // The live process lives on its own page now.
              if (goToOnboarding) router.push("/onboarding");
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/**
 * Turns a hired applicant into a real team member: creates their login through
 * the admin-only API, carries over their name, email and role, and optionally
 * starts the default onboarding checklist in the same step.
 */
function HireForm({
  applicant,
  onDone,
}: {
  applicant: Applicant;
  onDone: (goToOnboarding: boolean) => void;
}) {
  const { rows: templates } = useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: items } = useSupabaseTable<OnboardingTemplateItem>(
    "onboarding_template_items"
  );
  const { rows: roles } = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });

  const [fullName, setFullName] = useState(applicant.full_name);
  const [email, setEmail] = useState(applicant.email ?? "");
  const [password, setPassword] = useState("");
  const [accessLevel, setAccessLevel] = useState<string>("full_time");
  const [roleId, setRoleId] = useState(applicant.role_id ?? "");
  const [startChecklist, setStartChecklist] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Everything downstream hangs off the chosen role: the team they join and
   *  the checklist they start. No second guess, nothing to keep in sync. */
  const chosenRole = roles.find((r) => r.id === roleId) ?? null;
  const roleTemplate = chosenRole?.template_id
    ? templates.find((t) => t.id === chosenRole.template_id) ?? null
    : null;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/team-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role: accessLevel,
        team: chosenRole?.team ?? null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(json.error ?? "Couldn't create the team member.");
      return;
    }

    const profileId = json?.profile?.id as string | undefined;
    const supabase = createClient();

    if (profileId && supabase) {
      // Record the role itself, so their Position and team stay correct even if
      // someone later renames the team.
      await supabase.from("profiles").update({ role_id: roleId || null }).eq("id", profileId);

      // The role's own checklist, not a global default. Clear whatever the
      // profile trigger may have seeded first so nobody ends up with two.
      if (startChecklist && roleTemplate) {
        const steps = items.filter((i) => i.template_id === roleTemplate.id);
        if (steps.length > 0) {
          await supabase.from("onboarding_tasks").delete().eq("profile_id", profileId);
          await supabase.from("onboarding_tasks").insert(
            steps.map((s) => ({
              profile_id: profileId,
              title: s.title,
              section: s.section,
              sort_order: s.sort_order,
            }))
          );
        }
      }
    }

    setBusy(false);
    toast.success(`${fullName.trim()} added to the team`);
    onDone(startChecklist);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="rounded-lg border border-success/30 bg-success/10 p-3">
        <p className="text-[13px] font-medium text-success">{applicant.full_name}</p>
        <p className="mt-0.5 text-[11px] text-foreground-secondary">
          {roles.find((r) => r.id === applicant.role_id)?.name ?? "No role recorded"}
          {applicant.location ? ` · ${applicant.location}` : ""}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        This creates their login and profile. Skip if they already have an account, or if
        they don&apos;t start for a while — they stay on the board as hired either way.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="they@example.com"
          />
        </div>
        <div>
          <Label>Role</Label>
          <Dropdown
            value={roleId}
            placeholder={roles.length ? "Choose a role" : "Add roles in Settings"}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            onChange={setRoleId}
          />
        </div>
        <div>
          <Label>Team</Label>
          {/* Read-only: the role decides it, so the two can't disagree. */}
          <div className="flex h-9 items-center rounded-md border border-white/10 bg-white/[0.02] px-3 text-sm text-foreground-secondary">
            {chosenRole?.team ?? "Set by the role"}
          </div>
        </div>
        <div>
          <Label>Employment type</Label>
          <Dropdown
            value={accessLevel}
            options={[
              ...STAFF_TYPES.map((t) => ({ value: t, label: USER_ROLE_LABELS[t] })),
              { value: "admin", label: USER_ROLE_LABELS.admin },
            ]}
            onChange={setAccessLevel}
          />
          <p className="mt-1 text-[11px] text-muted-2">
            What they can open comes from the {chosenRole?.name ?? "role"} above.
          </p>
        </div>
      </div>

      <div>
        <Label>Temporary password</Label>
        <Input
          type="text"
          placeholder="Min 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-muted-2">
          Share this with them; they can change it after signing in.
        </p>
      </div>

      <Checkbox
        checked={startChecklist}
        onChange={setStartChecklist}
        className="items-start"
        label={
          <span className="text-sm">
          Start their onboarding checklist
          <span className="block text-xs text-muted-foreground">
            {roleTemplate
              ? `Uses "${roleTemplate.name}", the checklist for this role.`
              : chosenRole
                ? "This role has no checklist yet — set one in Settings."
                : "Pick a role to see its checklist."}
            </span>
          </span>
        }
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          className="flex-1"
          disabled={busy || !fullName.trim() || !email.trim() || password.length < 8 || !roleId}
        >
          {busy ? "Creating..." : "Add to team"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          Not now
        </Button>
      </div>
    </form>
  );
}

/* ============================ APPLICANTS ============================ */

function Applicants({ onHired }: { onHired: (a: Applicant) => void }) {
  const { rows: roles } = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });
  const { rows: applicants, setRows, loading } = useSupabaseTable<Applicant>("applicants", {
    column: "created_at",
    ascending: false,
  });

  /** Role names are looked up, never stored on the applicant — rename a role in
   *  Settings and every board card follows. */
  const roleName = (a: Applicant) => roles.find((r) => r.id === a.role_id)?.name ?? null;

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [locationFilter, setLocationFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /**
   * A board is the right shape for moving people along, and the wrong shape
   * for reading a list. Past ~20 applicants the columns scroll independently
   * and you can no longer answer "who applied this month" without dragging.
   * The table is the same data, sortable.
   */
  const [view, setView] = useViewPreference<"board" | "list">("recruiting", "board");
  const [sort, setSort] = useState<"recent" | "name" | "stage" | "shortlisted">("recent");

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

  /** The table gave sorting for free; the card list has to do it explicitly. */
  const sortedList = useMemo(() => {
    const rows = [...visible];
    switch (sort) {
      case "name":
        return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
      case "stage":
        return rows.sort(
          (a, b) => APPLICANT_STAGES.indexOf(a.stage) - APPLICANT_STAGES.indexOf(b.stage)
        );
      case "shortlisted":
        return rows.sort((a, b) => Number(b.shortlisted) - Number(a.shortlisted));
      default:
        return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [visible, sort]);


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
        role_id: roleId || null,
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
    setRoleId("");
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
      return;
    }

    // Hiring someone almost always means giving them a login — but not on the
    // same day, and sometimes never (freelancers you already onboarded). Ask,
    // don't assume. Skipping leaves them on the board as hired, which is still
    // a true record.
    if (stage === "hired") {
      onHired({ ...applicant, stage: "hired" });
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
        {view === "list" && (
          <div className="w-40">
            <Dropdown
              value={sort}
              options={[
                { value: "recent", label: "Most recent" },
                { value: "shortlisted", label: "Shortlisted first" },
                { value: "stage", label: "By stage" },
                { value: "name", label: "By name" },
              ]}
              onChange={(v) => setSort(v as typeof sort)}
            />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
            {([
              ["board", "Board", LayoutGrid],
              ["list", "List", List],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors",
                  view === id
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground-secondary"
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setFormOpen((o) => !o)}>
            <Plus className="h-3.5 w-3.5" /> Add applicant
          </Button>
        </div>
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
                <Dropdown
                  value={roleId}
                  placeholder={roles.length ? "Choose a role" : "Add roles in Settings"}
                  options={roles.map((r) => ({
                    value: r.id,
                    label: r.team ? `${r.name} · ${r.team}` : r.name,
                  }))}
                  onChange={setRoleId}
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
      ) : view === "list" ? (
        /*
         * Card rows, not table rows.
         *
         * The table I built first was better for sorting forty applicants and
         * worse for doing anything about them — every action meant opening the
         * detail modal. The reference puts the two things you actually do
         * (shortlist, get in touch) directly on the row, always visible rather
         * than revealed on hover. That turns a triage session from open-decide-
         * close into a single pass down the list.
         *
         * Sorting moved into the toolbar so nothing was lost.
         */
        <div className="flex flex-col gap-2">
          {sortedList.map((a, i) => {
            const role = roleName(a);
            return (
              <div
                key={a.id}
                onClick={() => setOpenId(a.id)}
                style={staggerDelay(i)}
                className={cn(
                  "animate-row group flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2",
                  "rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:bg-white/[0.03]",
                  a.stage === "rejected" && "opacity-45 hover:opacity-90"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-foreground">
                      {role ?? a.full_name}
                    </span>
                    <Badge tone={STAGE_TONE[a.stage]}>
                      {APPLICANT_STAGE_LABELS[a.stage].toLowerCase()}
                    </Badge>
                    {a.shortlisted && (
                      <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
                    {role && <span className="truncate">{a.full_name}</span>}
                    {a.resume_url && (
                      <a
                        href={a.resume_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open CV"
                        className="rounded p-0.5 text-primary transition-colors hover:bg-white/5"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <span>{formatDate(a.created_at)}</span>
                    {a.location && <span className="text-muted-2">· {a.location}</span>}
                  </div>
                </div>

                <div
                  className="flex shrink-0 items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() =>
                      updateApplicant(a.id, { shortlisted: !a.shortlisted })
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      a.shortlisted
                        ? "border-warning/40 bg-warning/10 text-warning"
                        : "border-border text-foreground-secondary hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", a.shortlisted && "fill-warning")} />
                    {a.shortlisted ? "Shortlisted" : "Shortlist"}
                  </button>

                  {/* mailto rather than a compose modal — you already have a
                      mail client, and it keeps the thread where you'll look
                      for it later. Disabled honestly when we have no address. */}
                  <a
                    href={
                      a.email
                        ? `mailto:${a.email}?subject=${encodeURIComponent(
                            role ? `Your application — ${role}` : "Your application"
                          )}`
                        : undefined
                    }
                    aria-disabled={!a.email}
                    title={a.email ?? "No email on file"}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                      a.email
                        ? "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
                        : "pointer-events-none opacity-40"
                    )}
                  >
                    <Mail className="h-3.5 w-3.5" /> Outreach
                  </a>
                </div>
              </div>
            );
          })}
        </div>
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
                  {roleName(a) && (
                    <p className="truncate text-[11px] text-muted-foreground">{roleName(a)}</p>
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
            roles={roles}
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
  roles,
  onChange,
  onDelete,
}: {
  applicant: Applicant;
  roles: Role[];
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
        {/* A picker, not free text. Typing "Video Editor" here while the add
            form recorded the "Video editing" role gave two answers to the same
            question — and the role is what selects their onboarding
            checklist, so the disagreement had consequences. */}
        <div>
          <Label>Role</Label>
          <Dropdown
            value={draft.role_id ?? ""}
            placeholder={roles.length ? "Choose a role" : "Add roles in Settings"}
            options={[
              { value: "", label: "No role yet" },
              ...roles.map((r) => ({ value: r.id, label: r.name })),
            ]}
            onChange={(v) => {
              setDraft((d) => ({ ...d, role_id: v || null }));
              onChange({ role_id: v || null });
            }}
          />
        </div>
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
 * Checklist templates — the GUIDELINE, not the live process.
 *
 * A template describes the shape a new hire's first weeks should take. Running
 * it against real people happens on the Onboarding page, because tracking a
 * person's progress is a different job from defining the process and shouldn't
 * be buried in a hiring tool.
 */
function Onboarding() {
  const { rows: templates, setRows: setTemplates, loading } =
    useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: items, setRows: setItems } = useSupabaseTable<OnboardingTemplateItem>(
    "onboarding_template_items",
    { column: "sort_order", ascending: true }
  );

  const [templateName, setTemplateName] = useState("");
  const [itemDrafts, setItemDrafts] = useState<Record<string, string>>({});
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});

  const defaultTemplate = templates.find((t) => t.is_default) ?? null;

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

  async function renameTemplate(id: string, name: string) {
    const before = templates;
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_templates")
      .update({ name })
      .eq("id", id);
    if (error) setTemplates(before);
  }

  async function setWelcome(id: string, welcome_note: string) {
    const before = templates;
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, welcome_note } : t)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_templates")
      .update({ welcome_note: welcome_note || null })
      .eq("id", id);
    if (error) setTemplates(before);
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
    const section = sectionDrafts[templateId] ?? ONBOARDING_SECTIONS[0];
    const existing = items.filter((i) => i.template_id === templateId);
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("onboarding_template_items")
      .insert({ template_id: templateId, title, section, sort_order: existing.length })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setItems((prev) => [...prev, data as OnboardingTemplateItem]);
    setItemDrafts((prev) => ({ ...prev, [templateId]: "" }));
  }

  /** Steps are editable in place — a checklist you can't reword is a checklist
   *  you'll stop maintaining. Saves on blur. */
  async function renameItem(id: string, title: string) {
    const before = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("onboarding_template_items")
      .update({ title })
      .eq("id", id);
    if (error) {
      setItems(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteItem(id: string) {
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("onboarding_template_items").delete().eq("id", id);
    if (error) setItems(before);
  }

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-[13px] text-foreground-secondary">
          These are the guidelines — the steps a new hire should go through. Running one
          against a real person happens on the Onboarding page.
          {defaultTemplate ? (
            <>
              {" "}
              New team members get <span className="font-medium">{defaultTemplate.name}</span>{" "}
              automatically.
            </>
          ) : (
            " Mark one as default and new team members will get it automatically."
          )}
        </p>
        <Link
          href="/onboarding"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          Open Onboarding <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const tItems = items.filter((i) => i.template_id === t.id);
          return (
            <Card key={t.id} className="rounded-xl shadow-sm">
              <div className="flex items-center gap-2">
                <input
                  value={t.name}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x))
                    )
                  }
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) renameTemplate(t.id, v);
                  }}
                  className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-foreground hover:border-border focus:border-primary/60 focus:outline-none"
                />
                {t.is_default ? (
                  <Badge tone="green">Default</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(t.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => deleteTemplate(t.id)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-0.5 px-1 text-[11px] text-muted-2">
                {tItems.length} step{tItems.length === 1 ? "" : "s"}
              </p>

              {/* Grouped by phase — a flat list never says WHEN a step happens. */}
              <div className="mt-2.5 flex flex-col gap-2.5">
                {groupBySection(tItems).map(([section, sectionItems]) => (
                  <div key={section}>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
                      {section}
                    </p>
                    <div className="flex flex-col gap-1">
                {sectionItems.map((i, idx) => (
                  <div
                    key={i.id}
                    className="group flex items-center gap-2 rounded-md border border-border-subtle pl-2.5 pr-1 transition-colors focus-within:border-primary/40"
                  >
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-muted-2">
                      {idx + 1}
                    </span>
                    {/* Click straight into the text and retype it. */}
                    <input
                      value={i.title}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === i.id ? { ...x, title: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== i.title) renameItem(i.id, v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${i.title}`}
                      onClick={() => deleteItem(i.id)}
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
                  addItem(t.id);
                }}
                className="mt-2 flex items-center gap-2"
              >
                <div className="w-36 shrink-0">
                  <Dropdown
                    value={sectionDrafts[t.id] ?? ONBOARDING_SECTIONS[0]}
                    options={ONBOARDING_SECTIONS.map((sn) => ({ value: sn, label: sn }))}
                    onChange={(v) => setSectionDrafts((prev) => ({ ...prev, [t.id]: v }))}
                  />
                </div>
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

              <div className="mt-2">
                <Label>Welcome note</Label>
                <Textarea
                  rows={2}
                  placeholder="Shown at the top of every checklist made from this template..."
                  value={t.welcome_note ?? ""}
                  onChange={(e) =>
                    setTemplates((prev) =>
                      prev.map((x) =>
                        x.id === t.id ? { ...x, welcome_note: e.target.value } : x
                      )
                    )
                  }
                  onBlur={(e) => setWelcome(t.id, e.target.value)}
                />
              </div>
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
            <Button type="submit" size="sm" variant="secondary" disabled={!templateName.trim()}>
              <Plus className="h-3.5 w-3.5" /> Create template
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
