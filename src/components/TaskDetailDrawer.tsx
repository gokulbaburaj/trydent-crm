"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Link2, Plus, Trash2, User, X } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/utils";
import type { Profile, ProjectTask, TaskItem, TaskLink, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/types";

const SUBTASK_COLUMNS: TaskStatus[] = ["Not Started", "In Progress", "Done"];

export function TaskDetailDrawer({
  task,
  profiles,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: ProjectTask | null;
  profiles: Profile[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<ProjectTask>) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtasks, setSubtasks] = useState<TaskItem[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  const personName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? null;

  // Sync local editing state + load subtasks when a task opens.
  const taskId = task?.id ?? null;
  useEffect(() => {
    if (!taskId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || !task) return;
      setName(task.name);
      setLabel(task.label ?? "");
      setDescription(task.description ?? "");
      setLinkTitle("");
      setLinkUrl("");
      setNewSubtask("");
      setSubtasks([]);
    });
    async function load() {
      const supabase = createClient();
      if (!supabase) return;
      const { data } = await supabase
        .from("task_items")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (active) setSubtasks((data as TaskItem[]) ?? []);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) {
    return (
      <Drawer open={false} onClose={onClose} title="" wide>
        <div />
      </Drawer>
    );
  }

  const links: TaskLink[] = Array.isArray(task.links) ? task.links : [];

  function addLink(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const url = linkUrl.trim();
    if (!url) return;
    const title = linkTitle.trim() || new URL(withProtocol(url)).hostname;
    onUpdate(task.id, { links: [...links, { title, url: withProtocol(url) }] });
    setLinkTitle("");
    setLinkUrl("");
  }

  function removeLink(idx: number) {
    if (!task) return;
    onUpdate(task.id, { links: links.filter((_, i) => i !== idx) });
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    const n = newSubtask.trim();
    if (!n) return;
    setNewSubtask("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("task_items")
      .insert({ task_id: task.id, name: n, status: "Not Started", sort_order: subtasks.length })
      .select()
      .single();
    if (!error && data) setSubtasks((prev) => [...prev, data as TaskItem]);
  }

  async function updateSubtask(id: string, patch: Partial<TaskItem>) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("task_items").update(patch).eq("id", id);
  }

  async function deleteSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("task_items").delete().eq("id", id);
  }

  return (
    <Drawer open={!!task} onClose={onClose} title="Task details" wide>
      <div className="flex flex-col gap-6">
        {/* Name */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const n = name.trim();
            if (n && n !== task.name) onUpdate(task.id, { name: n });
          }}
          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-xl font-semibold tracking-tight text-foreground hover:border-border focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
        />

        {/* Property row */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusPicker
            value={task.status}
            options={TASK_STATUSES}
            onChange={(status) => onUpdate(task.id, { status })}
          />
          <Popover
            trigger={
              <button className="flex items-center gap-1.5 rounded border border-white/5 bg-white/5 px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-white/10">
                {task.assigned_to ? (
                  <>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[8px] font-semibold text-accent">
                      {initials(personName(task.assigned_to))}
                    </span>
                    {personName(task.assigned_to)}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3 text-muted" /> Assign
                  </>
                )}
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Assign to</MenuLabel>
                <MenuItem selected={!task.assigned_to} onClick={() => { onUpdate(task.id, { assigned_to: null }); close(); }}>
                  Unassigned
                </MenuItem>
                {profiles.map((p) => (
                  <MenuItem
                    key={p.id}
                    selected={task.assigned_to === p.id}
                    onClick={() => { onUpdate(task.id, { assigned_to: p.id }); close(); }}
                  >
                    {p.full_name}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          <div className="w-44">
            <DatePicker
              value={task.due_date}
              placeholder="Due date"
              onChange={(d) => onUpdate(task.id, { due_date: d })}
            />
          </div>
          <Input
            placeholder="Label (e.g. UI design)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              const l = label.trim();
              if (l !== (task.label ?? "")) onUpdate(task.id, { label: l || null });
            }}
            className="max-w-[160px]"
          />
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-danger hover:bg-danger/10"
            onClick={() => {
              if (confirm("Delete this task and its subtasks?")) {
                onDelete(task.id);
                onClose();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <textarea
            rows={3}
            placeholder="What needs to happen, context, notes..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? "")) {
                onUpdate(task.id, { description });
              }
            }}
            className="w-full resize-none rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        {/* Deliverables & links */}
        <div>
          <Label>Deliverables & links</Label>
          <div className="flex flex-col gap-1.5">
            {links.length === 0 && (
              <p className="rounded border border-dashed border-border px-3 py-3 text-center text-xs text-muted">
                No links yet — add the Google Drive folder, Figma file, or wherever the
                deliverable lives.
              </p>
            )}
            {links.map((l, idx) => (
              <div
                key={`${l.url}-${idx}`}
                className="group flex items-center gap-2.5 rounded border border-border bg-surface px-3 py-2"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.title}</p>
                  <p className="truncate text-xs text-muted">{l.url}</p>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded p-1.5 text-muted hover:bg-white/5 hover:text-foreground"
                  title="Open link"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => removeLink(idx)}
                  className="rounded p-1.5 text-muted opacity-0 hover:bg-white/5 hover:text-danger group-hover:opacity-100"
                  title="Remove link"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addLink} className="mt-2 flex items-center gap-2">
            <Input
              placeholder="Title (e.g. Drive folder)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              className="max-w-[180px]"
            />
            <Input
              placeholder="https://..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!linkUrl.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </form>
        </div>

        {/* Subtasks board */}
        <div>
          <Label>Subtasks</Label>
          <form onSubmit={addSubtask} className="mb-3 flex items-center gap-2">
            <Input
              placeholder="+ Add subtask"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!newSubtask.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
          {subtasks.length === 0 ? (
            <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
              Break this task down — subtasks get their own mini board.
            </p>
          ) : (
            <KanbanBoard
              columns={SUBTASK_COLUMNS.map((s) => ({ id: s, label: s }))}
              items={subtasks}
              getColumnId={(s) => s.status}
              onMove={(s, status) => updateSubtask(s.id, { status: status as TaskStatus })}
              columnClassName="w-52"
              renderCard={(s) => (
                <div className="group/sub flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px]">{s.name}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubtask(s.id);
                    }}
                    className="rounded p-0.5 text-muted opacity-0 hover:text-danger group-hover/sub:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            />
          )}
        </div>
      </div>
    </Drawer>
  );
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
