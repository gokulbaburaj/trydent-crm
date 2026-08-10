"use client";

import { useEffect, useState } from "react";
import {
  CheckCheck,
  ExternalLink,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  SkipForward,
  Trash2,
  User,
  X,
} from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/format";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { PriorityPicker } from "@/components/ui/PriorityPicker";
import { RecurrencePicker } from "@/components/ui/RecurrencePicker";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { createClient } from "@/lib/supabase/client";
import { initials } from "@/lib/format";
import type { Profile, ProjectTask, TaskComment, TaskItem, TaskLink, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/types";
import { confirmAction } from "@/components/ui/ConfirmDialog";

const SUBTASK_COLUMNS: TaskStatus[] = ["Not Started", "In Progress", "Done"];

export function TaskDetailDrawer({
  task,
  profiles,
  onClose,
  onUpdate,
  onDelete,
  onSkip,
}: {
  task: ProjectTask | null;
  profiles: Profile[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<ProjectTask>) => void;
  onDelete: (id: string) => void;
  /** Skip this occurrence of a recurring task (advances the series). */
  onSkip?: (task: ProjectTask) => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subtasks, setSubtasks] = useState<TaskItem[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const { profile } = useAuth();

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
      setComments([]);
      setNewComment("");
    });
    async function load() {
      const supabase = createClient();
      if (!supabase) return;
      const [itemsRes, commentsRes] = await Promise.all([
        supabase
          .from("task_items")
          .select("*")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true }),
        supabase
          .from("task_comments")
          .select("*")
          .eq("task_id", taskId)
          .order("created_at", { ascending: true }),
      ]);
      if (active) {
        setSubtasks((itemsRes.data as TaskItem[]) ?? []);
        setComments((commentsRes.data as TaskComment[]) ?? []);
      }
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

  /**
   * Edit a link in place.
   *
   * Adding was possible and removing was possible, but a typo in a URL meant
   * deleting the row and retyping both fields. Blank titles fall back to the
   * hostname exactly as `addLink` does, so an emptied title doesn't leave a
   * nameless row.
   */
  function updateLink(idx: number, patch: Partial<TaskLink>) {
    if (!task) return;
    const next = links.map((l, i) => {
      if (i !== idx) return l;
      const url = withProtocol((patch.url ?? l.url).trim());
      const rawTitle = (patch.title ?? l.title).trim();
      let title = rawTitle;
      if (!title) {
        try {
          title = new URL(url).hostname;
        } catch {
          title = url;
        }
      }
      return { title, url };
    });
    onUpdate(task.id, { links: next });
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

  /*
    Deliberately NOT confirmed, unlike every other delete in the app.

    A subtask is one line in a checklist you're actively editing, deleted from
    a row you're already hovering. Confirming it costs a modal per line while
    tidying a list, and the thing at risk is a sentence you typed. The point of
    a confirmation is to interrupt an action whose cost exceeds the cost of
    being interrupted; here it doesn't.

    Over-confirming is its own failure mode — it teaches people to dismiss the
    dialog without reading, which is exactly what makes the client-delete one
    dangerous. Same reasoning applies to deleteItem in recruiting.
  */
  async function deleteSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("task_items").delete().eq("id", id);
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !profile) return;
    const body = newComment.trim();
    if (!body) return;
    setNewComment("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, author_id: profile.id, body })
      .select()
      .single();
    if (!error && data) setComments((prev) => [...prev, data as TaskComment]);
  }

  return (
    <Drawer open={!!task} onClose={onClose} title="Task details" wide>
      <div className="flex flex-col gap-6">
        {task.approved_at && (
          <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[13px] text-[var(--success-fg)]">
            <CheckCheck className="h-4 w-4 shrink-0" />
            Approved by the client on {formatDate(task.approved_at)}
          </div>
        )}
        {/* Name + delete */}
        <div className="flex items-start gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const n = name.trim();
              if (n && n !== task.name) onUpdate(task.id, { name: n });
            }}
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xl font-semibold tracking-tight text-foreground hover:border-border focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {task.recurrence !== "none" && onSkip ? (
            <Popover
              align="right"
              trigger={
                <button
                  title="More actions"
                  className="mt-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-hover hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={<SkipForward className="h-3.5 w-3.5" />}
                    onClick={() => {
                      close();
                      onSkip(task);
                      onClose();
                    }}
                  >
                    Skip this occurrence
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      // Close the menu first either way — leaving a popover
                      // open behind a modal traps focus between the two.
                      close();
                      const ok = await confirmAction({
                        title: `Delete “${task.name}”?`,
                        body: "Its subtasks are deleted with it.",
                        confirmLabel: "Delete task",
                      });
                      if (!ok) return;
                      onDelete(task.id);
                      onClose();
                    }}
                  >
                    Delete task
                  </MenuItem>
                </>
              )}
            </Popover>
          ) : (
            <button
              title="Delete task"
              onClick={async () => {
                const ok = await confirmAction({
                  title: `Delete “${task.name}”?`,
                  body: "Its subtasks are deleted with it.",
                  confirmLabel: "Delete task",
                });
                if (!ok) return;
                onDelete(task.id);
                onClose();
              }}
              className="mt-1 shrink-0 rounded-md p-2 text-muted-foreground hover:bg-danger/10 hover:text-[var(--danger-fg)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Properties grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label>Status</Label>
            <StatusPicker
              value={task.status}
              options={TASK_STATUSES}
              onChange={(status) => onUpdate(task.id, { status })}
            />
          </div>
          <div>
            <Label>Priority</Label>
            <PriorityPicker
              value={task.priority}
              onChange={(priority) => onUpdate(task.id, { priority })}
            />
          </div>
          <div>
            <Label>Assignee</Label>
            <Popover
              fullWidth
              trigger={
                <button className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground hover:bg-hover">
                  {task.assigned_to ? (
                    <>
                      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary">
                        {initials(personName(task.assigned_to))}
                      </span>
                      <span className="min-w-0 truncate">{personName(task.assigned_to)}</span>
                    </>
                  ) : (
                    <>
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-muted-2">Unassigned</span>
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
          </div>
          {/*
            Start and due sit together as a pair, because that's what they are.
            Start is optional: null means the task lives entirely on its due
            date, which is every task created before 2026-08-08b.
          */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start date</Label>
              <DatePicker
                value={task.start_date}
                placeholder="Same day"
                // The database enforces start <= due; stopping the picker from
                // offering an impossible date is friendlier than letting the
                // write fail and surfacing a constraint error.
                maxDate={task.due_date ?? undefined}
                onChange={(d) => onUpdate(task.id, { start_date: d })}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <DatePicker
                value={task.due_date}
                placeholder="Due date"
                minDate={task.start_date ?? undefined}
                onChange={(d) =>
                  // Times hang off the due date. Clearing it has to clear them
                  // too, or the row keeps a 3pm that belongs to no day and the
                  // check constraint has nothing to catch it. A start with no
                  // due date is allowed — that's open-ended work — so it stays.
                  onUpdate(task.id, d ? { due_date: d } : { due_date: null, due_time: null, end_time: null })
                }
              />
            </div>
          </div>
          {/* Times only make sense once there's a day to hang them on. */}
          {task.due_date && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start time</Label>
                <TimePicker
                  value={task.due_time}
                  placeholder="All day"
                  onChange={(t) =>
                    // Dropping the start must drop the end: the database
                    // rejects an end with no start, so sending one would fail
                    // the write rather than just look odd.
                    onUpdate(task.id, t ? { due_time: t } : { due_time: null, end_time: null })
                  }
                />
              </div>
              <div>
                <Label>End time</Label>
                <TimePicker
                  value={task.end_time}
                  placeholder={task.due_time ? "Optional" : "Set a start time first"}
                  minTime={task.due_time}
                  onChange={(t) => onUpdate(task.id, { end_time: t })}
                />
              </div>
            </div>
          )}
          <div>
            <Label>Label</Label>
            <Input
              placeholder="e.g. UI design"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                const l = label.trim();
                if (l !== (task.label ?? "")) onUpdate(task.id, { label: l || null });
              }}
            />
          </div>
          <div>
            <Label>Repeat</Label>
            <RecurrencePicker
              value={task.recurrence}
              onChange={(recurrence) => onUpdate(task.id, { recurrence })}
            />
          </div>
        </div>

        {task.recurrence !== "none" && (
          <p className="-mt-3 text-xs text-muted-foreground">
            The next occurrence is created automatically when this task is marked Done.
          </p>
        )}

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
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {/* Deliverables & links */}
        <div>
          <Label>Deliverables & links</Label>
          <div className="flex flex-col gap-1.5">
            {links.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                No links yet — add the Google Drive folder, Figma file, or wherever the
                deliverable lives.
              </p>
            )}
            {links.map((l, idx) => (
              <div
                key={idx} /* index, not url — keying on a value you can edit remounts mid-typing */
                className="group flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2"
              >
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {/* Inputs rather than text: a link you can open and delete but
                    not correct means retyping both fields over one typo. They
                    read as plain text until focused so the row stays calm. */}
                <div className="min-w-0 flex-1">
                  <input
                    defaultValue={l.title}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== l.title) {
                        updateLink(idx, { title: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.value = l.title;
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label="Link title"
                    className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-foreground hover:border-border focus:border-primary/60 focus:outline-none"
                  />
                  <input
                    defaultValue={l.url}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== l.url) {
                        updateLink(idx, { url: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        e.currentTarget.value = l.url;
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label="Link URL"
                    className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground hover:border-border focus:border-primary/60 focus:text-foreground focus:outline-none"
                  />
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground"
                  title="Open link"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  onClick={() => removeLink(idx)}
                  className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-hover hover:text-[var(--danger-fg)] group-hover:opacity-100"
                  title="Remove link"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addLink} className="mt-2 grid grid-cols-[1fr_1.6fr_auto] items-center gap-2">
            <Input
              placeholder="Title (e.g. Drive folder)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
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
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Break this task down — subtasks get their own mini board.
            </p>
          ) : (
            <KanbanBoard
              columns={SUBTASK_COLUMNS.map((s) => ({ id: s, label: s }))}
              items={subtasks}
              getColumnId={(s) => s.status}
              onMove={(s, status) => updateSubtask(s.id, { status: status as TaskStatus })}
              /* Subtask mini-board stays compact instead of stretching. */
              columnClassName="w-52 min-w-0 flex-none"
              renderCard={(s) => (
                <div className="group/sub flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px]">{s.name}</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSubtask(s.id);
                    }}
                    className="rounded-md p-0.5 text-muted-foreground opacity-0 hover:text-[var(--danger-fg)] group-hover/sub:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            />
          )}
        </div>

        {/* Comments */}
        <div>
          <Label>
            Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </Label>
          <div className="flex flex-col gap-2">
            {comments.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                No comments yet — client comments from the portal appear here too.
              </p>
            )}
            {comments.map((c) => {
              const author = profiles.find((p) => p.id === c.author_id);
              const isClient = author?.role === "client";
              return (
                <div
                  key={c.id}
                  className={`rounded-md border px-3 py-2 ${
                    isClient ? "border-primary/25 bg-primary/[0.06]" : "border-border bg-surface"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    <span className="font-medium text-foreground-secondary">
                      {author?.full_name ?? "Unknown"}
                    </span>
                    {isClient && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                        client
                      </span>
                    )}
                    <span className="ml-auto">
                      {formatDistanceToNow(parseISO(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{c.body}</p>
                </div>
              );
            })}
          </div>
          <form onSubmit={addComment} className="mt-2 flex items-center gap-2">
            <Input
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <Button type="submit" size="sm" variant="secondary" disabled={!newComment.trim()}>
              Send
            </Button>
          </form>
        </div>
      </div>
    </Drawer>
  );
}

function withProtocol(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
