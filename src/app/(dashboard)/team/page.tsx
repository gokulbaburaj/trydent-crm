"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Building2, CreditCard, Eye, Network, Plus, Trash2, User, UserPlus, Users } from "lucide-react";
import { toast } from "@/components/Toaster";
import { DataTable, Column } from "@/components/DataTable";
import { PersonCell } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { useCurrency } from "@/lib/currency";
import { useTabs } from "@/lib/tabs";
import { formatDate, initials, cn } from "@/lib/utils";
import type { Profile, StaffPayment, UserRole } from "@/lib/types";

const roleTone: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  rep: "blue",
  client: "gray",
  contractor: "gray",
};

const roleLabel: Record<string, string> = {
  admin: "Admin",
  rep: "Rep",
  contractor: "Contractor",
};

type View = "members" | "org";

interface MemberForm {
  full_name: string;
  email: string;
  password: string;
  role: "admin" | "rep" | "contractor";
  team: string;
  reports_to: string;
}

/** Never render a raw object — always surface something readable. */
function errorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

const emptyMember: MemberForm = {
  full_name: "",
  email: "",
  password: "",
  role: "rep",
  team: "",
  reports_to: "",
};

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>}>
      <TeamPageInner />
    </Suspense>
  );
}

function TeamPageInner() {
  const { profile: me } = useAuth();
  const searchParams = useSearchParams();
  const teamFilter = searchParams.get("team");
  const { rows: profiles, setRows } = useSupabaseTable<Profile>(
    "profiles",
    { column: "full_name", ascending: true }
  );
  const { rows: payments, setRows: setPayments } = useSupabaseTable<StaffPayment>("staff_payments");
  const { openInNewTab } = useTabs();
  const [view, setView] = useState<View>("members");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<MemberForm | null>(null);
  const [savingMember, setSavingMember] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<Profile | null>(null);

  const isAdmin = me?.role === "admin";

  // The Team page is for staff — clients are managed on the Clients page.
  const allStaff = useMemo(() => profiles.filter((p) => p.role !== "client"), [profiles]);
  // ?team= scopes the page to one team (used by the sidebar's team sub-links).
  const staff = useMemo(
    () => (teamFilter ? allStaff.filter((p) => p.team === teamFilter) : allStaff),
    [allStaff, teamFilter]
  );
  // Derived from everyone, so filtering to one team doesn't shrink the pickers.
  const teams = useMemo(
    () => Array.from(new Set(allStaff.map((p) => p.team).filter((t): t is string => !!t))).sort(),
    [allStaff]
  );
  const nameOf = (id: string | null) => allStaff.find((p) => p.id === id)?.full_name ?? null;

  async function patchProfile(id: string, patch: Partial<Profile>) {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) toast.error(`Couldn't save: ${error.message}`);
  }

  async function removeMember(p: Profile) {
    if (!confirm(`Remove ${p.full_name}? This deletes their login and access for good.`)) return;
    setRemovingId(p.id);
    const res = await fetch("/api/team-users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: p.id }),
    });
    const json = await res.json().catch(() => ({}));
    setRemovingId(null);
    if (!res.ok) {
      toast.error(json.error ?? "Couldn't remove team member.");
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== p.id));
    toast.success(`${p.full_name} removed`);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!adding) return;
    setSavingMember(true);
    setAddError(null);
    const res = await fetch("/api/team-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: adding.full_name,
        email: adding.email,
        password: adding.password,
        role: adding.role,
        team: adding.team || null,
        reports_to: adding.reports_to || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingMember(false);
    if (!res.ok) {
      setAddError(errorText(json?.error, "Couldn't add team member."));
      return;
    }
    if (json.profile) setRows((prev) => [json.profile as Profile, ...prev]);
    setAdding(null);
    if (json.warning) toast.error(errorText(json.warning, "Member added with warnings."));
    else toast.success(`${adding.full_name} added`);
  }

  async function addPayment(profileId: string, line: Omit<StaffPayment, "id" | "profile_id" | "created_at">) {
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("staff_payments")
      .insert({ profile_id: profileId, ...line })
      .select()
      .single();
    if (error) {
      toast.error(`Couldn't add: ${error.message}`);
      return;
    }
    setPayments((prev) => [...prev, data as StaffPayment]);
  }

  async function togglePaid(p: StaffPayment) {
    const status = p.status === "paid" ? "pending" : "paid";
    setPayments((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("staff_payments").update({ status }).eq("id", p.id);
  }

  async function deletePayment(id: string) {
    setPayments((prev) => prev.filter((x) => x.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("staff_payments").delete().eq("id", id);
  }

  const columns: Column<Profile>[] = [
    {
      header: "Name",
      render: (p) => <PersonCell name={p.full_name} subtitle={p.email} url={p.avatar_url} />,
      sortKey: (p) => p.full_name.toLowerCase(),
    },
    {
      header: "Role",
      render: (p) =>
        isAdmin ? (
          <div className="w-32" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              value={p.role}
              options={[
                { value: "admin", label: "Admin" },
                { value: "rep", label: "Rep" },
                { value: "contractor", label: "Contractor" },
              ]}
              onChange={(v) => patchProfile(p.id, { role: v as UserRole })}
            />
          </div>
        ) : (
          <Badge tone={roleTone[p.role]}>{roleLabel[p.role] ?? p.role}</Badge>
        ),
      sortKey: (p) => p.role,
    },
    {
      header: "Team",
      render: (p) =>
        isAdmin ? (
          <TeamPicker value={p.team} teams={teams} onChange={(team) => patchProfile(p.id, { team })} />
        ) : p.team ? (
          <Badge tone="gray">{p.team}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      sortKey: (p) => p.team?.toLowerCase() ?? "~",
    },
    {
      header: "Reports to",
      render: (p) =>
        isAdmin ? (
          <ManagerPicker
            value={p.reports_to}
            options={allStaff.filter((s) => s.id !== p.id)}
            onChange={(reports_to) => patchProfile(p.id, { reports_to })}
          />
        ) : (
          <span className="text-sm text-foreground-secondary">{nameOf(p.reports_to) ?? "—"}</span>
        ),
      sortKey: (p) => nameOf(p.reports_to)?.toLowerCase() ?? "~",
    },
    { header: "Joined", render: (p) => formatDate(p.created_at), sortKey: (p) => p.created_at },
    ...(isAdmin
      ? [
          {
            header: "",
            className: "w-20 text-right",
            render: (p: Profile) => (
              <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                {p.role === "contractor" && (
                  <>
                    <button
                      onClick={() => openInNewTab(`/staff-portal?user=${p.id}`, `${p.full_name.split(" ")[0]} — preview`)}
                      title="Preview staff portal"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setPayFor(p)}
                      title="Payment plan"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {p.id === me?.id ? (
                  <span className="px-1 text-[11px] text-muted-2">You</span>
                ) : (
                  <button
                    onClick={() => removeMember(p)}
                    disabled={removingId === p.id}
                    title="Remove team member"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ),
          } as Column<Profile>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm text-muted-foreground">
            {isAdmin
              ? "Set roles, teams, and reporting lines for your team."
              : "Your team, their roles, and who reports to whom."}
          </p>
          {teamFilter && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-primary">
              Team: {teamFilter}
              <Link
                href="/team"
                title="Clear team filter"
                className="rounded-full p-0.5 hover:bg-white/10"
              >
                <X className="h-3 w-3" />
              </Link>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
            <ViewButton active={view === "members"} onClick={() => setView("members")} icon={Users} label="Members" />
            <ViewButton active={view === "org"} onClick={() => setView("org")} icon={Network} label="Org chart" />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setAddError(null); setAdding({ ...emptyMember }); }}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          )}
        </div>
      </div>

      <div key={view} className="animate-fade">
        {view === "members" ? (
          <DataTable columns={columns} rows={staff} rowKey={(p) => p.id} emptyMessage="No team members yet." />
        ) : (
          <OrgChart staff={staff} teams={teams} />
        )}
      </div>

      {/* Add member */}
      <Drawer open={!!adding} onClose={() => setAdding(null)} title="Add team member">
        {adding && (
          <form onSubmit={addMember} className="flex flex-col gap-4">
            <div>
              <Label>Full name</Label>
              <Input
                required
                value={adding.full_name}
                onChange={(e) => setAdding({ ...adding, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                required
                type="email"
                placeholder="name@example.com"
                value={adding.email}
                onChange={(e) => setAdding({ ...adding, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input
                required
                type="text"
                placeholder="Min 8 characters"
                value={adding.password}
                onChange={(e) => setAdding({ ...adding, password: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Dropdown
                value={adding.role}
                options={[
                  { value: "rep", label: "Rep — full app access" },
                  { value: "admin", label: "Admin — full app + manage team" },
                  { value: "contractor", label: "Contractor — restricted staff portal" },
                ]}
                onChange={(v) => setAdding({ ...adding, role: v as MemberForm["role"] })}
              />
              {adding.role === "contractor" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sees only their own tasks, schedule, and payment plan — not clients, pipeline, or revenue.
                </p>
              )}
            </div>
            <div>
              <Label>Team (optional)</Label>
              <Input
                placeholder="e.g. Design"
                value={adding.team}
                onChange={(e) => setAdding({ ...adding, team: e.target.value })}
              />
            </div>
            <div>
              <Label>Reports to (optional)</Label>
              <Dropdown
                value={adding.reports_to}
                options={[
                  { value: "", label: "No manager" },
                  ...allStaff.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setAdding({ ...adding, reports_to: v })}
              />
            </div>
            {addError && <p className="text-xs text-danger">{addError}</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={savingMember} className="flex-1">
                {savingMember ? "Adding..." : "Add member"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* Contractor payment plan */}
      <Drawer open={!!payFor} onClose={() => setPayFor(null)} title={payFor ? `${payFor.full_name} — Payment plan` : ""}>
        {payFor && (
          <PaymentPlanEditor
            lines={payments.filter((p) => p.profile_id === payFor.id)}
            onAdd={(line) => addPayment(payFor.id, line)}
            onTogglePaid={togglePaid}
            onDelete={deletePayment}
          />
        )}
      </Drawer>
    </div>
  );
}

/* ---------------------------------- Payment plan ---------------------------------- */

function PaymentPlanEditor({
  lines,
  onAdd,
  onTogglePaid,
  onDelete,
}: {
  lines: StaffPayment[];
  onAdd: (line: Omit<StaffPayment, "id" | "profile_id" | "created_at">) => void;
  onTogglePaid: (p: StaffPayment) => void;
  onDelete: (id: string) => void;
}) {
  const { format: formatCurrency, base } = useCurrency();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + Number(l.amount), 0);
  const paid = lines.filter((l) => l.status === "paid").reduce((s, l) => s + Number(l.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(total)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Paid</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-success">{formatCurrency(paid)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Outstanding</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-warning">{formatCurrency(total - paid)}</p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border-subtle">
        {lines.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No payments in this plan yet.</p>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
            <button
              onClick={() => onTogglePaid(l)}
              title={l.status === "paid" ? "Mark pending" : "Mark paid"}
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                l.status === "paid"
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              )}
            >
              {l.status === "paid" ? "Paid" : "Pending"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{l.label}</p>
              {l.due_date && <p className="text-xs text-muted-foreground">Due {formatDate(l.due_date)}</p>}
            </div>
            <span className="shrink-0 tabular-nums">{formatCurrency(Number(l.amount))}</span>
            <button
              onClick={() => onDelete(l.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-danger"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const amt = Number(amount);
          if (!label.trim() || !amt) return;
          onAdd({ label: label.trim(), amount: amt, status: "pending", due_date: dueDate });
          setLabel("");
          setAmount("");
          setDueDate(null);
        }}
        className="flex flex-col gap-3 rounded-lg border border-border bg-white/[0.02] p-3"
      >
        <span className="text-[13px] font-medium">Add a payment</span>
        <Input placeholder="Label (e.g. Milestone 1, Monthly retainer)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" min={0} placeholder={`Amount (${base})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <DatePicker value={dueDate} placeholder="Due date" onChange={setDueDate} />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={!label.trim() || !Number(amount)}>
          <Plus className="h-3.5 w-3.5" /> Add payment
        </Button>
      </form>
    </div>
  );
}

/* ---------------------------------- Org chart ---------------------------------- */

function OrgChart({ staff, teams }: { staff: Profile[]; teams: string[] }) {
  const byManager = useMemo(() => {
    const map = new Map<string, Profile[]>();
    for (const p of staff) {
      if (!p.reports_to) continue;
      const arr = map.get(p.reports_to) ?? [];
      arr.push(p);
      map.set(p.reports_to, arr);
    }
    return map;
  }, [staff]);

  const ids = useMemo(() => new Set(staff.map((p) => p.id)), [staff]);
  // Roots: no manager, or manager not in the staff set (defensive).
  const roots = useMemo(
    () => staff.filter((p) => !p.reports_to || !ids.has(p.reports_to)),
    [staff, ids]
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Teams summary */}
      <div className="flex flex-wrap items-center gap-2">
        {teams.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No teams assigned yet — set a team on the Members tab.
          </span>
        ) : (
          teams.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground-secondary"
            >
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {t}
              <span className="rounded-full bg-white/10 px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {staff.filter((p) => p.team === t).length}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Reporting tree */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
        {roots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          roots.map((p) => (
            <OrgNode key={p.id} person={p} byManager={byManager} depth={0} seen={new Set()} />
          ))
        )}
      </div>
    </div>
  );
}

function OrgNode({
  person,
  byManager,
  depth,
  seen,
}: {
  person: Profile;
  byManager: Map<string, Profile[]>;
  depth: number;
  seen: Set<string>;
}) {
  if (seen.has(person.id)) return null; // guard against reporting cycles
  const nextSeen = new Set(seen);
  nextSeen.add(person.id);
  const reports = byManager.get(person.id) ?? [];

  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border-subtle pl-4")}>
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
          {initials(person.full_name)}
        </span>
        <span className="text-sm font-medium">{person.full_name}</span>
        <Badge tone={roleTone[person.role]}>{person.role}</Badge>
        {person.team && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="h-3 w-3" />
            {person.team}
          </span>
        )}
        {reports.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-2">
            {reports.length} report{reports.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {reports.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {reports.map((r) => (
            <OrgNode key={r.id} person={r} byManager={byManager} depth={depth + 1} seen={nextSeen} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Pickers ---------------------------------- */

function TeamPicker({
  value,
  teams,
  onChange,
}: {
  value: string | null;
  teams: string[];
  onChange: (team: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover
        trigger={
          <button className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-white/10">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            {value || <span className="text-muted-2">No team</span>}
          </button>
        }
      >
        {(close) => (
          <>
            <MenuLabel>Team</MenuLabel>
            <MenuItem selected={!value} onClick={() => { onChange(null); close(); }}>
              No team
            </MenuItem>
            {teams.map((t) => (
              <MenuItem key={t} selected={t === value} onClick={() => { onChange(t); close(); }}>
                {t}
              </MenuItem>
            ))}
            <MenuSeparator />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const t = draft.trim();
                if (t) {
                  onChange(t);
                  setDraft("");
                  close();
                }
              }}
              className="flex items-center gap-1 px-1 py-1"
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New team…"
                className="h-7 w-32 min-w-0 flex-1 rounded border border-white/15 bg-transparent px-2 text-xs text-foreground placeholder:text-muted-2 focus:border-primary/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
                title="Add team"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </form>
          </>
        )}
      </Popover>
    </div>
  );
}

function ManagerPicker({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Profile[];
  onChange: (id: string | null) => void;
}) {
  const current = options.find((o) => o.id === value);
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Popover
        trigger={
          <button className="inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-white/10">
            <User className="h-3 w-3 text-muted-foreground" />
            {current ? current.full_name : <span className="text-muted-2">No manager</span>}
          </button>
        }
      >
        {(close) => (
          <>
            <MenuLabel>Reports to</MenuLabel>
            <MenuItem selected={!value} onClick={() => { onChange(null); close(); }}>
              No manager
            </MenuItem>
            {options.map((o) => (
              <MenuItem key={o.id} selected={o.id === value} onClick={() => { onChange(o.id); close(); }}>
                {o.full_name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
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
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
