"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/utils";
import type { Activity, Client, Deal, Profile } from "@/lib/types";

const emptyForm: Partial<Activity> = {
  description: "",
  outcome: "",
  location: "",
  follow_up_required: false,
  client_id: null,
  deal_id: null,
  assigned_to: null,
  activity_date: new Date().toISOString().slice(0, 16),
};

export default function ActivitiesPage() {
  const { profile } = useAuth();
  const { rows: activities, setRows } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [onlyMine, setOnlyMine] = useState(false);
  const [editing, setEditing] = useState<Partial<Activity> | null>(null);
  const [saving, setSaving] = useState(false);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.company ?? "—";
  const assigneeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const filtered = useMemo(
    () => (onlyMine && profile ? activities.filter((a) => a.assigned_to === profile.id) : activities),
    [activities, onlyMine, profile]
  );

  const columns: Column<Activity>[] = [
    { header: "Description", render: (a) => <span className="font-medium">{a.description}</span> },
    { header: "Client", render: (a) => clientName(a.client_id) },
    { header: "Assigned To", render: (a) => assigneeName(a.assigned_to) },
    { header: "Date", render: (a) => formatDate(a.activity_date) },
    {
      header: "Follow-up",
      render: (a) => (a.follow_up_required ? <Badge tone="yellow" dot>Required</Badge> : <span className="text-muted">—</span>),
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
        .from("activities")
        .update(editing)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) setRows((prev) => prev.map((a) => (a.id === data.id ? (data as Activity) : a)));
    } else {
      const { data, error } = await supabase.from("activities").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as Activity, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this activity?")) return;
    await supabase.from("activities").delete().eq("id", id);
    setRows((prev) => prev.filter((a) => a.id !== id));
    setEditing(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="h-4 w-4 rounded accent-accent"
          />
          Assigned to me
        </label>
        <Button size="sm" onClick={() => setEditing({ ...emptyForm })}>
          <Plus className="h-4 w-4" /> New Activity
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(a) => a.id}
        onRowClick={setEditing}
        emptyMessage="No activities yet."
      />

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Activity" : "New Activity"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Description</Label>
              <Textarea
                required
                rows={2}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Outcome</Label>
              <Input
                value={editing.outcome ?? ""}
                onChange={(e) => setEditing({ ...editing, outcome: e.target.value })}
              />
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={editing.location ?? ""}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Select
                value={editing.client_id ?? ""}
                onChange={(e) => setEditing({ ...editing, client_id: e.target.value || null })}
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Deal</Label>
              <Select
                value={editing.deal_id ?? ""}
                onChange={(e) => setEditing({ ...editing, deal_id: e.target.value || null })}
              >
                <option value="">—</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.deal_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select
                value={editing.assigned_to ?? ""}
                onChange={(e) => setEditing({ ...editing, assigned_to: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="datetime-local"
                value={
                  editing.activity_date
                    ? new Date(editing.activity_date).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) => setEditing({ ...editing, activity_date: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!editing.follow_up_required}
                onChange={(e) => setEditing({ ...editing, follow_up_required: e.target.checked })}
                className="h-4 w-4 rounded accent-accent"
              />
              Follow-up required
            </label>
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
