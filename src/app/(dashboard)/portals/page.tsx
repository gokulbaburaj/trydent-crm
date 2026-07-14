"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { ClientPortal, Client } from "@/lib/types";
import { PORTAL_STATUSES } from "@/lib/types";

const emptyForm: Partial<ClientPortal> = {
  client_id: "",
  status: "Not Started",
  notes: "",
};

export default function PortalsPage() {
  const { rows: portals, setRows } = useSupabaseTable<ClientPortal>(
    "client_portals",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");

  const [editing, setEditing] = useState<Partial<ClientPortal> | null>(null);
  const [saving, setSaving] = useState(false);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";

  const columns: Column<ClientPortal>[] = [
    { header: "Client", render: (p) => <span className="font-medium">{clientName(p.client_id)}</span> },
    {
      header: "Status",
      render: (p) => (
        <Badge tone={statusTone(p.status)} dot>
          {p.status}
        </Badge>
      ),
    },
    { header: "Notes", render: (p) => p.notes || "—" },
    { header: "Updated", render: (p) => formatDate(p.updated_at) },
  ];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    if (editing.id) {
      const { data, error } = await supabase
        .from("client_portals")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) setRows((prev) => prev.map((p) => (p.id === data.id ? (data as ClientPortal) : p)));
    } else {
      const { data, error } = await supabase.from("client_portals").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as ClientPortal, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this portal?")) return;
    await supabase.from("client_portals").delete().eq("id", id);
    setRows((prev) => prev.filter((p) => p.id !== id));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "" })}>
          <Plus className="h-4 w-4" /> New Portal
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={portals}
        rowKey={(p) => p.id}
        onRowClick={setEditing}
        emptyMessage="No client portals yet."
      />

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Portal" : "New Portal"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Client</Label>
              <Select
                required
                value={editing.client_id ?? ""}
                onChange={(e) => setEditing({ ...editing, client_id: e.target.value })}
              >
                <option value="" disabled>Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={editing.status ?? "Not Started"}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as ClientPortal["status"] })}
              >
                {PORTAL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              {editing.id && (
                <Button type="button" variant="danger" onClick={() => handleDelete(editing.id as string)}>
                  Delete
                </Button>
              )}
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
