"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Project, Client, Profile } from "@/lib/types";
import { PROJECT_STATUSES } from "@/lib/types";

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
  const { rows: projects, setRows } = useSupabaseTable<Project>(
    "projects",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [selected, setSelected] = useState<Project | null>(null);
  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const [saving, setSaving] = useState(false);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  async function handleStatusMove(project: Project, status: string) {
    setRows((prev) =>
      prev.map((p) => (p.id === project.id ? { ...p, status: status as Project["status"] } : p))
    );
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("projects").update({ status }).eq("id", project.id);
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
        if (selected?.id === data.id) setSelected(data as Project);
      }
    } else {
      const { data, error } = await supabase.from("projects").insert(editing).select().single();
      if (!error && data) setRows((prev) => [data as Project, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this project?")) return;
    await supabase.from("projects").delete().eq("id", id);
    setRows((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </h2>
        <Button
          size="sm"
          onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "" })}
        >
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      <KanbanBoard
        columns={PROJECT_STATUSES.map((s) => ({ id: s, label: s }))}
        items={projects}
        getColumnId={(p) => p.status}
        onMove={handleStatusMove}
        renderCard={(p) => (
          <div onClick={() => setSelected(p)}>
            <p className="text-sm font-medium">{p.name}</p>
            <p className="mt-0.5 text-xs text-muted">{clientName(p.client_id)}</p>
            {p.due_date && (
              <p className="mt-2 text-xs text-muted">Due {formatDate(p.due_date)}</p>
            )}
          </div>
        )}
      />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
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
              <Info label="Client" value={clientName(selected.client_id)} />
              <Info label="Owner" value={ownerName(selected.owner)} />
              <Info label="Start Date" value={formatDate(selected.start_date)} />
              <Info label="Due Date" value={formatDate(selected.due_date)} />
            </div>

            {selected.description && (
              <div>
                <p className="text-xs font-medium text-muted">Description</p>
                <p className="text-sm">{selected.description}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>

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
                value={editing.status ?? "Planning"}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as Project["status"] })}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={editing.start_date ?? ""}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })}
                />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={editing.due_date ?? ""}
                  onChange={(e) => setEditing({ ...editing, due_date: e.target.value || null })}
                />
              </div>
            </div>
            <div>
              <Label>Owner</Label>
              <Select
                value={editing.owner ?? ""}
                onChange={(e) => setEditing({ ...editing, owner: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
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

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
