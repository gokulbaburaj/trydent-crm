"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Select } from "@/components/ui/Select";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import type { Project, ProjectTask, Client, Profile } from "@/lib/types";
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
  const { openInNewTab } = useTabs();
  const { rows: projects, setRows } = useSupabaseTable<Project>(
    "projects",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: tasks } = useSupabaseTable<ProjectTask>("project_tasks");

  const [editing, setEditing] = useState<Partial<Project> | null>(null);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const grouped = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
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
  }, [projects, clients]);

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
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted">
          {projects.length} project{projects.length !== 1 ? "s" : ""} across{" "}
          {grouped.length} client{grouped.length !== 1 ? "s" : ""}
        </h2>
        <Button
          size="sm"
          onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "" })}
        >
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {grouped.length === 0 && (
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            No projects yet. Create your first one to see it organized by client here.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {grouped.map(({ clientId, client, items }) => {
          const isCollapsed = collapsed[clientId];
          return (
            <div key={clientId} className="rounded-md border border-border bg-surface">
              <div
                onClick={() => toggle(clientId)}
                className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate text-sm font-semibold">
                    {client?.company ?? "Unknown Client"}
                  </span>
                  {client && (
                    <Badge tone={statusTone(client.status)} dot>
                      {client.status}
                    </Badge>
                  )}
                  <span className="shrink-0 text-xs text-muted">
                    {items.length} project{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ ...emptyForm, client_id: clientId });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>

              {!isCollapsed && (
                <div className="grid grid-cols-1 gap-2.5 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((p) => {
                    const pct = completionOf(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => openInNewTab(`/projects/${p.id}`, p.name)}
                        className="rounded border border-border bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          <Badge tone={statusTone(p.status)} dot>
                            {p.status}
                          </Badge>
                        </div>
                        {pct !== null && (
                          <div className="mt-2.5 flex items-center gap-2">
                            <span className="text-xs tabular-nums text-muted">
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
                          <p className="mt-2 text-xs text-muted">Due {formatDate(p.due_date)}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">Owner: {ownerName(p.owner)}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
