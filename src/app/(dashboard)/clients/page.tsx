"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { PersonCell } from "@/components/ui/Avatar";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
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
  const [selected, setSelected] = useState<Client | null>(null);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);
  const [saving, setSaving] = useState(false);

  const ownerName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const columns: Column<Client>[] = [
    {
      header: "Company",
      render: (c) => <PersonCell name={c.company} subtitle={c.point_person} />,
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
    },
    { header: "Email", render: (c) => c.email || "—" },
    { header: "Owner", render: (c) => ownerName(c.account_owner) },
    { header: "Last Contact", render: (c) => formatDate(c.last_contact) },
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
      if (!error && data) {
        setRows((prev) => prev.map((c) => (c.id === data.id ? (data as Client) : c)));
        if (selected?.id === data.id) setSelected(data as Client);
      }
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert(editing)
        .select()
        .single();
      if (!error && data) setRows((prev) => [data as Client, ...prev]);
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
              view === "table" ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground-secondary"
            }`}
          >
            <List className="h-3.5 w-3.5" /> Table
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
              view === "kanban" ? "bg-white/10 text-foreground" : "text-muted hover:text-foreground-secondary"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Kanban
          </button>
        </div>
        <Button onClick={() => setEditing({ ...emptyForm })} size="sm">
          <Plus className="h-4 w-4" /> New Client
        </Button>
      </div>

      {view === "table" ? (
        <DataTable
          columns={columns}
          rows={clients}
          rowKey={(c) => c.id}
          onRowClick={setSelected}
          emptyMessage={loading ? "Loading..." : "No clients yet."}
        />
      ) : (
        <KanbanBoard
          columns={CLIENT_STATUSES.map((s) => ({ id: s, label: s }))}
          items={clients}
          getColumnId={(c) => c.status}
          onMove={handleStageMove}
          renderCard={(c) => (
            <div onClick={() => setSelected(c)}>
              <p className="text-sm font-medium">{c.company}</p>
              <p className="mt-0.5 text-xs text-muted">{c.point_person || "No contact"}</p>
            </div>
          )}
        />
      )}

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
                <p className="text-xs font-medium text-muted">Address</p>
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
                    <p className="mt-1 text-xs text-muted">${Number(d.deal_value).toLocaleString()}</p>
                  </div>
                ))}
                {selectedDeals.length === 0 && (
                  <p className="text-xs text-muted">No deals linked.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Activities ({selectedActivities.length})</h4>
              <div className="flex flex-col gap-2">
                {selectedActivities.map((a) => (
                  <div key={a.id} className="rounded border border-border p-3 text-sm">
                    <p>{a.description}</p>
                    <p className="mt-1 text-xs text-muted">{formatDate(a.activity_date)}</p>
                  </div>
                ))}
                {selectedActivities.length === 0 && (
                  <p className="text-xs text-muted">No activities linked.</p>
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
                <p className="text-xs text-muted">No portal set up.</p>
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
              <Select
                value={editing.status ?? "Lead"}
                onChange={(e) =>
                  setEditing({ ...editing, status: e.target.value as Client["status"] })
                }
              >
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Lead Source</Label>
              <Select
                value={editing.lead_source ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, lead_source: (e.target.value || null) as Client["lead_source"] })
                }
              >
                <option value="">—</option>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Account Owner</Label>
              <Select
                value={editing.account_owner ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, account_owner: e.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
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
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
