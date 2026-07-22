"use client";

import { useMemo, useState } from "react";
import { Building2, Network, Plus, Trash2, User, Users } from "lucide-react";
import { toast } from "@/components/Toaster";
import { DataTable, Column } from "@/components/DataTable";
import { PersonCell } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate, initials, cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/lib/types";

const roleTone: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  rep: "blue",
  client: "gray",
};

type View = "members" | "org";

export default function TeamPage() {
  const { profile: me } = useAuth();
  const { rows: profiles, setRows } = useSupabaseTable<Profile>(
    "profiles",
    { column: "full_name", ascending: true }
  );
  const [view, setView] = useState<View>("members");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isAdmin = me?.role === "admin";

  // The Team page is for staff — clients are managed on the Clients page.
  const staff = useMemo(() => profiles.filter((p) => p.role !== "client"), [profiles]);
  const teams = useMemo(
    () => Array.from(new Set(staff.map((p) => p.team).filter((t): t is string => !!t))).sort(),
    [staff]
  );
  const nameOf = (id: string | null) => staff.find((p) => p.id === id)?.full_name ?? null;

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
          <div className="w-28" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              value={p.role}
              options={[
                { value: "admin", label: "Admin" },
                { value: "rep", label: "Rep" },
              ]}
              onChange={(v) => patchProfile(p.id, { role: v as UserRole })}
            />
          </div>
        ) : (
          <Badge tone={roleTone[p.role]}>{p.role}</Badge>
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
            options={staff.filter((s) => s.id !== p.id)}
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
            className: "w-10 text-right",
            render: (p: Profile) =>
              p.id === me?.id ? (
                <span className="text-[11px] text-muted-2">You</span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMember(p);
                  }}
                  disabled={removingId === p.id}
                  title="Remove team member"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ),
          } as Column<Profile>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Set roles, teams, and reporting lines for your team."
            : "Your team, their roles, and who reports to whom."}
        </p>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
          <ViewButton active={view === "members"} onClick={() => setView("members")} icon={Users} label="Members" />
          <ViewButton active={view === "org"} onClick={() => setView("org")} icon={Network} label="Org chart" />
        </div>
      </div>

      <div key={view} className="animate-fade">
        {view === "members" ? (
          <DataTable columns={columns} rows={staff} rowKey={(p) => p.id} emptyMessage="No team members yet." />
        ) : (
          <OrgChart staff={staff} teams={teams} />
        )}
      </div>
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
