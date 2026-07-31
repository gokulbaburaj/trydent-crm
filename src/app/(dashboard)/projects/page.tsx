"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDot,
  IndianRupee,
  LayoutGrid,
  List,
  Plus,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { useCurrency } from "@/lib/currency";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dropdown } from "@/components/ui/Dropdown";
import { FilterBar } from "@/components/FilterBar";
import { DataTable, type Column } from "@/components/DataTable";
import { useViewPreference } from "@/lib/useViewPreference";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { staggerDelay } from "@/lib/motion";
import type { Deal, Project, ProjectTask, Client } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";
import { useTabs } from "@/lib/tabs";

const emptyForm: Partial<Project> = {
  name: "",
  client_id: "",
  status: "Planning",
  owner: null,
  start_date: null,
  due_date: null,
  description: "",
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ProjectsPageInner />
    </Suspense>
  );
}

function ProjectsPageInner() {
  const { openInNewTab } = useTabs();
  const searchParams = useSearchParams();
  const teamFilter = searchParams.get("team");
  const { rows: allProjects, setRows } = useSupabaseTable<Project>(
    "projects",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useStaffProfiles();
  const { rows: tasks } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { format: formatCurrency } = useCurrency();

  /** The deal a project came out of, when it was created from one. */
  const dealFor = (p: Project) => deals.find((d) => d.id === p.deal_id) ?? null;

  const { filters, views, setFilters, setViews } = useStoredFilters("projects");
  /**
   * Sort applies WITHIN each client group, not across them.
   * The page is grouped by client and that grouping is the point — a flat list
   * sorted by due date would scatter one client's work across the page.
   */
  /**
   * Table or grouped cards.
   *
   * The cards group by client, which is right when you're thinking "what are we
   * doing for Mixlabs". It's useless when you're thinking "what's due next" —
   * sorting inside a group of three shows you nothing. The table is flat, so
   * clicking a header actually reorders the page.
   */
  const [view, setView] = useViewPreference<"table" | "grouped">("projects", "table");

  const projectColumns: Column<Project>[] = useMemo(() => {
    const completionOf = (id: string) => {
      const t = tasks.filter((x) => x.project_id === id);
      return t.length === 0 ? null : (t.filter((x) => x.status === "Done").length / t.length) * 100;
    };
    return [
      {
        header: "Project",
        sortKey: (p) => p.name,
        render: (p) => <span className="font-medium">{p.name}</span>,
      },
      {
        header: "Client",
        icon: Building2,
        sortKey: (p) => clients.find((c) => c.id === p.client_id)?.company ?? "",
        render: (p) => (
          <span className="text-muted-foreground">
            {clients.find((c) => c.id === p.client_id)?.company ?? "—"}
          </span>
        ),
      },
      {
        header: "Status",
        icon: CircleDot,
        sortKey: (p) => PROJECT_STATUSES.indexOf(p.status),
        render: (p) => <Badge tone={statusTone(p.status)} dot>{p.status}</Badge>,
      },
      {
        header: "Progress",
        className: "w-40",
        // Projects with no tasks sort last rather than as 0% — "not started"
        // and "no plan yet" are different things.
        sortKey: (p) => completionOf(p.id) ?? -1,
        render: (p) => {
          const pct = completionOf(p.id);
          if (pct === null) return <span className="text-muted-2">No tasks</span>;
          return (
            <div className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                {pct.toFixed(0)}%
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        },
      },
      {
        header: "Value",
        icon: IndianRupee,
        className: "text-right tabular-nums",
        sortKey: (p) => Number(dealFor(p)?.deal_value ?? 0),
        render: (p) => {
          const deal = dealFor(p);
          if (!deal) return <span className="text-muted-2">—</span>;
          return formatCurrency(Number(deal.deal_value), deal.currency);
        },
      },
      {
        header: "Outstanding",
        icon: IndianRupee,
        className: "text-right tabular-nums",
        sortKey: (p) => {
          const d = dealFor(p);
          return d ? Math.max(0, Number(d.deal_value) - Number(d.paid)) : -1;
        },
        render: (p) => {
          const deal = dealFor(p);
          if (!deal) return <span className="text-muted-2">—</span>;
          const owed = Math.max(0, Number(deal.deal_value) - Number(deal.paid));
          return owed > 0 ? (
            <span className="text-warning">{formatCurrency(owed, deal.currency)}</span>
          ) : (
            <span className="text-success">paid</span>
          );
        },
      },
      {
        header: "Due",
        icon: CalendarDays,
        // Undated last, not first — an empty date isn't "due at the dawn of time".
        sortKey: (p) => p.due_date ?? "9999-12-31",
        render: (p) => (
          <span className="text-muted-foreground">
            {p.due_date ? formatDate(p.due_date) : "—"}
          </span>
        ),
      },
      {
        header: "Owner",
        icon: User,
        sortKey: (p) => ownerName(p.owner),
        render: (p) => <span className="text-muted-foreground">{ownerName(p.owner)}</span>,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, tasks, deals, profiles]);

  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  // ?team= scopes to projects owned by someone on that team (sidebar sub-link).
  // Archived projects are hidden here and in Accounts — the data stays, the
  // clutter doesn't.
  const projects = useMemo(() => {
    const live = allProjects.filter((p) => !p.archived);
    if (!teamFilter) return live;
    const memberIds = new Set(profiles.filter((p) => p.team === teamFilter).map((p) => p.id));
    return live.filter((p) => p.owner && memberIds.has(p.owner));
  }, [allProjects, profiles, teamFilter]);

  /** Search, status and owner, using the same FilterBar as everywhere else. */
  const filtered = useMemo(
    () =>
      applyFilters(projects, filters, {
        text: (p) => [p.name, clients.find((c) => c.id === p.client_id)?.company],
        status: (p) => p.status,
        assignee: (p) => p.owner,
        due: (p) => p.due_date,
      }),
    [projects, filters, clients]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      const arr = map.get(p.client_id) ?? [];
      arr.push(p);
      map.set(p.client_id, arr);
    }
    return Array.from(map.entries())
      .map(([clientId, items]) => ({
        clientId,
        client: clients.find((c) => c.id === clientId) ?? null,
        items,
      }))
      .sort((a, b) => (a.client?.company ?? "").localeCompare(b.client?.company ?? ""));
  }, [filtered, clients]);

  function toggle(clientId: string) {
    setCollapsed((prev) => ({ ...prev, [clientId]: !prev[clientId] }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("projects")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setRows((prev) => prev.map((p) => (p.id === data.id ? (data as Project) : p)));
      }
    } else {
      const { data, error } = await supabase.from("projects").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as Project, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  function completionOf(projectId: string) {
    const active = tasks.filter((t) => t.project_id === projectId && t.status !== "Archived");
    if (active.length === 0) return null;
    return (active.filter((t) => t.status === "Done").length / active.length) * 100;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm text-muted-foreground">
            {/* Counts the filtered set, and says so when it differs — a header
                claiming 11 projects above a list showing 3 is worse than no
                header at all. */}
            {filtered.length} project{filtered.length !== 1 ? "s" : ""} across{" "}
            {grouped.length} client{grouped.length !== 1 ? "s" : ""}
            {filtered.length !== projects.length && (
              <span className="text-muted-2"> · {projects.length} total</span>
            )}
          </h2>
          {teamFilter && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-primary">
              Team: {teamFilter}
              <Link href="/projects" title="Clear team filter" className="rounded-full p-0.5 hover:bg-white/10">
                <X className="h-3 w-3" />
              </Link>
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "" })}
        >
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            views={views}
            onViewsChange={setViews}
            statuses={PROJECT_STATUSES}
            statusLabel="Status"
            assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
            showDue
            dueLabel="Due date"
            placeholder="Filter projects…"
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
          {([["table", "Table", List], ["grouped", "By client", LayoutGrid]] as const).map(
            ([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                  view === id
                    ? "bg-white/10 font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          )}
        </div>
      </div>

      {view === "table" ? (
        <DataTable
          rows={filtered}
          columns={projectColumns}
          rowKey={(p) => p.id}
          onRowClick={(p) => openInNewTab(`/projects/${p.id}`, p.name)}
          emptyMessage="No projects match these filters."
        />
      ) : (
        <>
        {grouped.length === 0 && (
          <Card>
            <p className="py-10 text-center text-sm text-muted-foreground">
              No projects yet. Create your first one to see it organized by client here.
            </p>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {grouped.map(({ clientId, client, items }, groupIndex) => {
            const isCollapsed = collapsed[clientId];
            return (
              <div
                key={clientId}
                className="animate-row rounded-md border border-border bg-surface"
                style={staggerDelay(groupIndex)}
              >
                <div
                  onClick={() => toggle(clientId)}
                  className="flex cursor-pointer items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4"
                >
                  {/* On a phone the name, the status pill and the count can't
                      share one line — the name is what loses, and a row reading
                      just "Active Customer · 1 project" tells you nothing. So the
                      name gets its own line below `sm`. */}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        !isCollapsed && "rotate-90"
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="truncate text-sm font-semibold">
                        {client?.company ?? "Unknown Client"}
                      </span>
                      <div className="flex min-w-0 items-center gap-2">
                        {client && (
                          <Badge tone={statusTone(client.status)} dot className="shrink-0">
                            {client.status}
                          </Badge>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {items.length} project{items.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing({ ...emptyForm, client_id: clientId });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-2.5 border-t border-border p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
                    {items.map((p, cardIndex) => {
                      const pct = completionOf(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => openInNewTab(`/projects/${p.id}`, p.name)}
                          style={staggerDelay(cardIndex, 22, 200)}
                          className="animate-row rounded border border-border bg-white/[0.02] p-3 text-left transition-[border-color,background-color,box-shadow,translate] duration-150 hover:-translate-y-px hover:border-white/15 hover:bg-white/5 hover:shadow-lg hover:shadow-black/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{p.name}</span>
                            <Badge tone={statusTone(p.status)} dot>
                              {p.status}
                            </Badge>
                          </div>
                          {pct !== null && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {pct.toFixed(0)}%
                              </span>
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full rounded-full bg-success"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {p.due_date && (
                            <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(p.due_date)}</p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground">Owner: {ownerName(p.owner)}</p>
                          {/* What the job is worth and what's actually landed.
                              Only on projects that came from a deal — the rest
                              have no figure to show and a blank line reads as a
                              bug rather than an absence. */}
                          {(() => {
                            const deal = dealFor(p);
                            if (!deal) return null;
                            const value = Number(deal.deal_value);
                            const owed = Math.max(0, value - Number(deal.paid));
                            return (
                              <p className="mt-1 flex items-center gap-1.5 text-xs">
                                <span className="tabular-nums text-foreground-secondary">
                                  {formatCurrency(value, deal.currency)}
                                </span>
                                {owed > 0 ? (
                                  <span className="text-warning">
                                    · {formatCurrency(owed, deal.currency)} due
                                  </span>
                                ) : (
                                  <span className="text-success">· paid</span>
                                )}
                              </p>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Project" : "New Project"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Project Name</Label>
              <Input
                required
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Dropdown
                value={editing.client_id ?? ""}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.company }))}
                onChange={(v) => setEditing({ ...editing, client_id: v })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Dropdown
                value={editing.status ?? "Planning"}
                options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setEditing({ ...editing, status: v as Project["status"] })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <DatePicker
                  value={editing.start_date}
                  onChange={(d) => setEditing({ ...editing, start_date: d })}
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <DatePicker
                  value={editing.due_date}
                  onChange={(d) => setEditing({ ...editing, due_date: d })}
                />
              </div>
            </div>
            <div>
              <Label>Owner</Label>
              <Dropdown
                value={editing.owner ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...profiles.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, owner: v || null })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
