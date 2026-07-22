"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus, X } from "lucide-react";
import { toast } from "@/components/Toaster";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { BulkActionBar } from "@/components/BulkActionBar";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { PersonCell } from "@/components/ui/Avatar";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { useMultiSelect } from "@/lib/useMultiSelect";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import type { Client, Deal, Activity, ClientPortal, Profile } from "@/lib/types";
import { CLIENT_STATUSES, LEAD_SOURCES } from "@/lib/types";

type View = "table" | "kanban";

const emptyForm: Partial<Client> = {
  company: "",
  point_person: "",
  email: "",
  phone: "",
  address: "",
  status: "Lead",
  lead_source: null,
  tags: [],
};

export default function ClientsPage() {
  const { rows: clients, loading, setRows } = useSupabaseTable<Client>(
    "clients",
    { column: "created_at", ascending: false }
  );
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: activities } = useSupabaseTable<Activity>("activities");
  const { rows: portals } = useSupabaseTable<ClientPortal>("client_portals");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [view, setView] = useState<View>("table");
  const { format: formatCurrency } = useCurrency();
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);
  const [saving, setSaving] = useState(false);

  const ownerName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const { filters, views, setFilters, setViews } = useStoredFilters("clients");

  const allTags = useMemo(
    () => Array.from(new Set(clients.flatMap((c) => c.tags ?? []))).sort(),
    [clients]
  );

  const visibleClients = useMemo(
    () =>
      applyFilters(clients, filters, {
        text: (c) => [c.company, c.point_person, c.email, ...(c.tags ?? [])],
        status: (c) => c.status,
        assignee: (c) => c.account_owner,
        labels: (c) => c.tags ?? [],
        due: (c) => c.last_contact,
      }),
    [clients, filters]
  );

  // `selected` is taken by the detail drawer, so the multi-select set is `checked`.
  const { selected: checked, toggle, setMany, clear } = useMultiSelect();

  // Bulk actions only touch rows that are both selected and currently visible.
  const selectedIds = useMemo(
    () => visibleClients.map((c) => c.id).filter((id) => checked.has(id)),
    [visibleClients, checked]
  );

  async function bulkUpdate(patch: Partial<Client>, what: string) {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setRows((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, ...patch } : c)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("clients").update(patch).in("id", ids);
    if (error) toast.error(`Couldn't update: ${error.message}`);
    else toast.success(`${what} set for ${ids.length} client${ids.length !== 1 ? "s" : ""}`);
  }

  async function bulkDelete() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} client${ids.length !== 1 ? "s" : ""}? This will remove linked deals/activities.`
      )
    )
      return;
    setRows((prev) => prev.filter((c) => !ids.includes(c.id)));
    clear();
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("clients").delete().in("id", ids);
    if (error) toast.error(`Couldn't delete: ${error.message}`);
    else toast.success(`Deleted ${ids.length} client${ids.length !== 1 ? "s" : ""}`);
  }

  const columns: Column<Client>[] = [
    {
      header: "Company",
      render: (c) => <PersonCell name={c.company} subtitle={c.point_person} />,
      sortKey: (c) => c.company.toLowerCase(),
    },
    {
      header: "Status",
      render: (c) => (
        <StatusPicker
          value={c.status}
          options={CLIENT_STATUSES}
          onChange={(status) => handleStageMove(c, status)}
        />
      ),
      sortKey: (c) => CLIENT_STATUSES.indexOf(c.status),
    },
    {
      header: "Email",
      render: (c) => c.email || "—",
      sortKey: (c) => c.email?.toLowerCase() || null,
    },
    {
      header: "Owner",
      render: (c) => ownerName(c.account_owner),
      sortKey: (c) =>
        c.account_owner ? ownerName(c.account_owner).toLowerCase() : null,
    },
    {
      header: "Last Contact",
      render: (c) => formatDate(c.last_contact),
      sortKey: (c) => c.last_contact,
    },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("clients")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (error) toast.error(`Couldn't save: ${error.message}`);
      if (!error && data) {
        setRows((prev) => prev.map((c) => (c.id === data.id ? (data as Client) : c)));
        if (selected?.id === data.id) setSelected(data as Client);
        toast.success("Client updated");
      }
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(editing)
        .select()
        .single();
      if (error) toast.error(`Couldn't save: ${error.message}`);
      if (!error && data) {
        setRows((prev) => [data as Client, ...prev]);
        toast.success("Client created");
      }
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this client? This will remove linked deals/activities.")) return;
    await supabase.from("clients").delete().eq("id", id);
    setRows((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
  }

  async function handleStageMove(client: Client, status: string) {
    setRows((prev) =>
      prev.map((c) => (c.id === client.id ? { ...c, status: status as Client["status"] } : c))
    );
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("clients").update({ status }).eq("id", client.id);
  }

  const selectedDeals = useMemo(
    () => deals.filter((d) => d.client_id === selected?.id),
    [deals, selected]
  );
  const selectedActivities = useMemo(
    () => activities.filter((a) => a.client_id === selected?.id),
    [activities, selected]
  );
  const selectedPortal = useMemo(
    () => portals.find((p) => p.client_id === selected?.id),
    [portals, selected]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
              view === "table" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
              view === "kanban" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        <Button onClick={() => setEditing({ ...emptyForm })} size="sm">
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        views={views}
        onViewsChange={setViews}
        statuses={CLIENT_STATUSES}
        assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
        labels={allTags}
        showDue
        dueLabel="Last contact"
        placeholder="Filter clients…"
      />

      <div key={view} className="animate-fade">
      {view === "table" ? (
        <DataTable
          columns={columns}
          rows={visibleClients}
          rowKey={(c) => c.id}
          onRowClick={setSelected}
          selection={{ selected: checked, onToggle: toggle, onToggleAll: setMany }}
          emptyMessage={
            loading ? (
              <TableSkeleton />
            ) : clients.length > 0 ? (
              "No clients match the current filters."
            ) : (
              <EmptyState
                icon={List}
                title="No clients yet"
                description="Clients are the heart of the CRM — add your first one to start tracking deals, projects, and schedules."
                actionLabel="New Client"
                onAction={() => setEditing({ ...emptyForm })}
              />
            )
          }
        />
      ) : (
        <KanbanBoard
          columns={CLIENT_STATUSES.map((s) => ({ id: s, label: s }))}
          items={visibleClients}
          getColumnId={(c) => c.status}
          onMove={handleStageMove}
          renderCard={(c) => (
            <div onClick={() => setSelected(c)}>
              <p className="text-sm font-medium">{c.company}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.point_person || "No contact"}</p>
            </div>
          )}
        />
      )}
      </div>

      {/* Detail drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.company ?? ""}>
        {selected && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(selected.status)} dot>
                {selected.status}
              </Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(selected)}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(selected.id)}>
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Contact" value={selected.point_person} />
              <Info label="Email" value={selected.email} />
              <Info label="Phone" value={selected.phone} />
              <Info label="Lead Source" value={selected.lead_source} />
              <Info label="Owner" value={ownerName(selected.account_owner)} />
              <Info label="Last Contact" value={formatDate(selected.last_contact)} />
            </div>

            {selected.address && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Address</p>
                <p className="text-sm">{selected.address}</p>
              </div>
            )}

            {selected.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.map((t) => (
                  <Badge key={t} tone="gray">{t}</Badge>
                ))}
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Deals ({selectedDeals.length})</h4>
              <div className="flex flex-col gap-2">
                {selectedDeals.map((d) => (
                  <div key={d.id} className="rounded border border-border p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{d.deal_name}</span>
                      <Badge tone={statusTone(d.deal_stage)}>{d.deal_stage}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(Number(d.deal_value))}</p>
                  </div>
                ))}
                {selectedDeals.length === 0 && (
                  <p className="text-xs text-muted-foreground">No deals linked.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Activities ({selectedActivities.length})</h4>
              <div className="flex flex-col gap-2">
                {selectedActivities.map((a) => (
                  <div key={a.id} className="rounded border border-border p-3 text-sm">
                    <p>{a.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(a.activity_date)}</p>
                  </div>
                ))}
                {selectedActivities.length === 0 && (
                  <p className="text-xs text-muted-foreground">No activities linked.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Client Portal</h4>
              {selectedPortal ? (
                <Badge tone={statusTone(selectedPortal.status)} dot>
                  {selectedPortal.status}
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground">No portal set up.</p>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Create/edit form drawer */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Client" : "New Client"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Company</Label>
              <Input
                required
                value={editing.company ?? ""}
                onChange={(e) => setEditing({ ...editing, company: e.target.value })}
              />
            </div>
            <div>
              <Label>Point of Contact</Label>
              <Input
                value={editing.point_person ?? ""}
                onChange={(e) => setEditing({ ...editing, point_person: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={editing.email ?? ""}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={editing.phone ?? ""}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea
                rows={2}
                value={editing.address ?? ""}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Dropdown
                value={editing.status ?? "Lead"}
                options={CLIENT_STATUSES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setEditing({ ...editing, status: v as Client["status"] })}
              />
            </div>
            <div>
              <Label>Lead Source</Label>
              <Dropdown
                value={editing.lead_source ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...LEAD_SOURCES.map((s) => ({ value: s, label: s })),
                ]}
                onChange={(v) =>
                  setEditing({ ...editing, lead_source: (v || null) as Client["lead_source"] })
                }
              />
            </div>
            <div>
              <Label>Tags</Label>
              <TagInput
                tags={editing.tags ?? []}
                onChange={(tags) => setEditing({ ...editing, tags })}
              />
            </div>
            <div>
              <Label>Account Owner</Label>
              <Dropdown
                value={editing.account_owner ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...profiles.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, account_owner: v || null })}
              />
            </div>
            <div>
              <Label>Last Contact</Label>
              <DatePicker
                value={editing.last_contact}
                onChange={(d) => setEditing({ ...editing, last_contact: d })}
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

      <BulkActionBar
        count={selectedIds.length}
        onClear={clear}
        statuses={CLIENT_STATUSES}
        onSetStatus={(s) => bulkUpdate({ status: s as Client["status"] }, "Status")}
        assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
        assigneeLabel="Owner"
        onSetAssignee={(id) => bulkUpdate({ account_owner: id }, "Owner")}
        showDue
        dueLabel="Last contact"
        onSetDue={(d) => bulkUpdate({ last_contact: d }, "Last contact")}
        onDelete={bulkDelete}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const t = draft.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-white/15 bg-transparent px-2 py-1.5 shadow-sm focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/20">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-xs text-foreground-secondary"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="rounded text-muted-foreground hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Type a tag, press Enter" : ""}
        className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none"
      />
    </div>
  );
}
