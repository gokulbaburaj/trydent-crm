"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  Library,
  Link2,
  Pencil,
  Pin,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { Markdown } from "@/components/Markdown";
import { RequireAccess } from "@/components/RequireAccess";
import { useResources, urlHost, normaliseUrl } from "@/lib/useResources";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RESOURCE_VISIBILITIES,
  RESOURCE_VISIBILITY_LABELS,
  type Client,
  type Project,
  type Role,
  type ResourceVisibility,
} from "@/lib/types";

export default function ResourcePage() {
  return (
    <RequireAccess page="resources">
      <ResourceInner />
    </RequireAccess>
  );
}

function ResourceInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { resources, loading, canEdit, update, remove } = useResources();
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: roles } = useSupabaseTable<Role>("roles", { column: "name" });
  const { rows: staff } = useStaffProfiles();

  const resource = resources.find((r) => r.id === params.id) ?? null;

  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  /*
   * Seed the local draft from the row when the row identity changes.
   *
   * Adjusting state during render rather than in an effect: React handles this
   * by re-running the component before committing, so there's no flash of the
   * previous note's text and no second paint. An effect here would be the
   * cascading-render pattern react-hooks/set-state-in-effect exists to catch —
   * and it would also fight the textarea for the cursor, because the hook's
   * optimistic writes hand back a new object on every save.
   */
  if (resource && seededFor !== resource.id) {
    setSeededFor(resource.id);
    setBody(resource.body ?? "");
    setTitle(resource.title);
  }

  const tagText = useMemo(() => (resource?.tags ?? []).join(", "), [resource?.tags]);

  if (loading && !resource) return <TableSkeleton rows={5} />;

  if (!resource) {
    return (
      <EmptyState
        icon={Library}
        title="Resource not found"
        description="It may have been deleted, or it may not be shared with you."
      />
    );
  }

  const isNote = resource.kind === "note";

  async function saveBody() {
    if (!resource) return;
    setEditing(false);
    const patch: Record<string, string> = {};
    if (title.trim() && title !== resource.title) patch.title = title.trim();
    // The shape constraint rejects an empty note, so an emptied editor is a
    // no-op rather than a failed round trip and a confusing toast.
    if (isNote && body.trim() && body !== resource.body) patch.body = body;
    if (Object.keys(patch).length > 0) await update(resource.id, patch);
  }

  async function setVisibility(visibility: ResourceVisibility) {
    if (!resource) return;
    // Clear the other list when switching. Leaving stale ids behind means a
    // toggle back to "roles" silently restores a set you'd forgotten about,
    // which on a permissions control is the wrong kind of surprise.
    await update(resource.id, {
      visibility,
      visible_role_ids: visibility === "roles" ? resource.visible_role_ids : [],
      visible_to: visibility === "people" ? resource.visible_to : [],
    });
  }

  async function toggleRole(roleId: string) {
    if (!resource) return;
    const on = resource.visible_role_ids.includes(roleId);
    await update(resource.id, {
      visible_role_ids: on
        ? resource.visible_role_ids.filter((id) => id !== roleId)
        : [...resource.visible_role_ids, roleId],
    });
  }

  async function togglePerson(profileId: string) {
    if (!resource) return;
    const on = resource.visible_to.includes(profileId);
    await update(resource.id, {
      visible_to: on
        ? resource.visible_to.filter((id) => id !== profileId)
        : [...resource.visible_to, profileId],
    });
  }

  async function destroy() {
    if (!resource) return;
    if (!confirm(`Delete “${resource.title}”? This can't be undone.`)) return;
    await remove(resource.id);
    toast.success("Resource deleted");
    router.push("/resources");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <Link
        href="/resources"
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Resources
      </Link>

      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15">
              {isNote ? (
                <FileText className="h-4 w-4 text-primary" />
              ) : (
                <Link2 className="h-4 w-4 text-primary" />
              )}
            </div>
            {editing ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold"
              />
            ) : (
              <h1 className="min-w-0 text-[19px] font-semibold leading-tight tracking-tight">
                {resource.title}
              </h1>
            )}
          </div>

          {canEdit && (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                title={resource.pinned ? "Unpin" : "Pin to the top of the list"}
                onClick={() => update(resource.id, { pinned: !resource.pinned })}
                className={cn(
                  "rounded-md border p-1.5 transition-colors",
                  resource.pinned
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Pin className={cn("h-3.5 w-3.5", resource.pinned && "fill-current")} />
              </button>
              {isNote &&
                (editing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" onClick={saveBody}>
                      <Check className="h-3.5 w-3.5" /> Save
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                ))}
              <button
                type="button"
                title="Delete resource"
                onClick={destroy}
                className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {resource.summary && (
          <p className="mt-2.5 text-sm text-foreground-secondary">{resource.summary}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Field label="Tags">
            {canEdit ? (
              <TagEditor
                key={resource.id}
                value={tagText}
                onSave={(tags) => update(resource.id, { tags })}
              />
            ) : (resource.tags ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {resource.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-foreground-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-2">None</span>
            )}
          </Field>

          <Field label="Client">
            {canEdit ? (
              <div className="w-44">
                <Dropdown
                  value={resource.client_id ?? ""}
                  onChange={(v) => update(resource.id, { client_id: v || null })}
                  options={[
                    { value: "", label: "None" },
                    ...clients.map((c) => ({ value: c.id, label: c.company })),
                  ]}
                />
              </div>
            ) : (
              <Chip icon={Building2}>
                {clients.find((c) => c.id === resource.client_id)?.company ?? "None"}
              </Chip>
            )}
          </Field>

          <Field label="Project">
            {canEdit ? (
              <div className="w-44">
                <Dropdown
                  value={resource.project_id ?? ""}
                  onChange={(v) => update(resource.id, { project_id: v || null })}
                  options={[
                    { value: "", label: "None" },
                    ...projects
                      .filter((p) => !p.archived)
                      .map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            ) : (
              <Chip icon={FolderKanban}>
                {projects.find((p) => p.id === resource.project_id)?.name ?? "None"}
              </Chip>
            )}
          </Field>

          <Field label="Updated">
            <span className="flex h-9 items-center text-xs text-muted-foreground">
              {formatDate(resource.updated_at)}
            </span>
          </Field>
        </div>
      </Card>

      {/* Visibility gets its own card rather than a chip in the row above.
          It's the only control here that decides what someone else can read,
          and burying it among "Tags" and "Client" would put a permissions
          change one accidental click away from a metadata change. */}
      {canEdit && (
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Visible to
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enforced by the database, not by hiding it here.
              </p>
            </div>
            <div className="ml-auto w-48">
              <Dropdown
                value={resource.visibility}
                onChange={(v) => setVisibility(v as ResourceVisibility)}
                options={RESOURCE_VISIBILITIES.map((v) => ({
                  value: v,
                  label: RESOURCE_VISIBILITY_LABELS[v],
                }))}
              />
            </div>
          </div>

          {resource.visibility === "roles" && (
            <PickerRow
              label="Roles"
              empty="No roles picked — nobody but admins can see this."
              chips={resource.visible_role_ids.map((id) => ({
                id,
                label: roles.find((r) => r.id === id)?.name ?? "Unknown role",
              }))}
              onRemove={toggleRole}
              options={roles.map((r) => ({ id: r.id, label: r.name }))}
              selected={resource.visible_role_ids}
              onToggle={toggleRole}
              menuLabel="Roles that can see this"
            />
          )}

          {resource.visibility === "people" && (
            <PickerRow
              label="People"
              empty="Nobody picked — only admins can see this."
              chips={resource.visible_to.map((id) => ({
                id,
                label: staff.find((p) => p.id === id)?.full_name ?? "Unknown",
              }))}
              onRemove={togglePerson}
              options={staff.map((p) => ({ id: p.id, label: p.full_name }))}
              selected={resource.visible_to}
              onToggle={togglePerson}
              menuLabel="People who can see this"
            />
          )}

          {resource.visibility !== "everyone" &&
            resource.visible_role_ids.length === 0 &&
            resource.visible_to.length === 0 && (
              <p className="mt-3 text-[11.5px] text-warning">
                Nothing selected, so this is currently admin-only.
              </p>
            )}
        </Card>
      )}

      {/* Body */}
      {isNote ? (
        <Card className="p-4 sm:p-5">
          {editing ? (
            <>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                className="font-mono text-[12.5px] leading-relaxed"
                placeholder="# Heading&#10;&#10;Markdown works: **bold**, *italic*, `code`, [links](https://…), - lists, > quotes."
              />
              <div className="mt-4 border-t border-border-subtle pt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-2">
                  Preview
                </p>
                <Markdown>{body}</Markdown>
              </div>
            </>
          ) : (
            <Markdown>{resource.body ?? ""}</Markdown>
          )}
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <Label>Link</Label>
          {canEdit ? (
            <UrlEditor
              key={resource.id}
              value={resource.url ?? ""}
              onSave={(url) => update(resource.id, { url })}
            />
          ) : (
            <a
              href={normaliseUrl(resource.url ?? "")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              {urlHost(resource.url)}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </Card>
      )}
    </div>
  );
}

/* ── Small pieces ───────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="flex h-9 items-center gap-1.5 text-xs text-foreground-secondary">
      <Icon className="h-3 w-3 text-muted-2" />
      {children}
    </span>
  );
}

/**
 * Commit on blur, not per keystroke — one write per edit, not one per letter.
 *
 * No effect syncing `value` into `text`: the parent gives this a key tied to
 * the resource id, so switching resources remounts it with fresh state. Within
 * one resource the only thing that changes `value` is this component saving,
 * at which point `text` already matches.
 */
function TagEditor({ value, onSave }: { value: string; onSave: (tags: string[]) => void }) {
  const [text, setText] = useState(value);

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const tags = text
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        if (tags.join(",") !== value) onSave(tags);
      }}
      placeholder="sop, pricing"
      className="w-52"
    />
  );
}

/** Same key-remount reasoning as TagEditor. */
function UrlEditor({ value, onSave }: { value: string; onSave: (url: string) => void }) {
  const [text, setText] = useState(value);

  return (
    <div className="flex items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = normaliseUrl(text);
          if (next && next !== value) onSave(next);
        }}
        placeholder="https://…"
      />
      {value && (
        <a
          href={normaliseUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open"
          className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function PickerRow({
  label,
  empty,
  chips,
  onRemove,
  options,
  selected,
  onToggle,
  menuLabel,
}: {
  label: string;
  empty: string;
  chips: { id: string; label: string }[];
  onRemove: (id: string) => void;
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  menuLabel: string;
}) {
  return (
    <div className="mt-3.5 border-t border-border-subtle pt-3.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-1.5 rounded-full border border-border bg-white/5 py-1 pl-2.5 pr-1.5 text-[11.5px]"
          >
            {c.label}
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="rounded-full p-0.5 text-muted-2 hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <Popover
          trigger={
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Users className="h-3 w-3" /> Add
            </button>
          }
        >
          {() => (
            <>
              <MenuLabel>{menuLabel}</MenuLabel>
              {options.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to pick.</div>
              )}
              {options.map((o) => (
                <MenuItem
                  key={o.id}
                  selected={selected.includes(o.id)}
                  /* Stays open — granting to four roles shouldn't mean opening
                     the menu four times. */
                  onClick={() => onToggle(o.id)}
                >
                  {o.label}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      </div>
      {chips.length === 0 && <p className="mt-1.5 text-[11.5px] text-warning">{empty}</p>}
    </div>
  );
}
