"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  Library,
  Link2,
  Pin,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
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

const NoteEditor = dynamic(() => import("@/components/NoteEditor"), {
  ssr: false,
  loading: () => <TableSkeleton rows={6} />,
});

export default function ResourcePage() {
  return (
    <RequireAccess page="resources">
      <ResourceInner />
    </RequireAccess>
  );
}

/*
 * A page, not a form.
 *
 * The card version read as a settings screen that happened to contain prose:
 * three bordered boxes, the title inside an input, metadata as full-width
 * selects. Put it beside a Notion page and the difference isn't colour, it's
 * that Notion has NO boxes — one column, one left edge, and properties that
 * stay quiet until you point at them.
 *
 * So no Card anywhere here. The rules:
 *   - one measured column, generous top space, everything sharing a left edge
 *   - the title is document scale and unbordered
 *   - properties are label-left rows that only show chrome on hover
 *   - the body flows straight on, no divider, no container
 */
function ResourceInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { resources, loading, canEdit, update, remove } = useResources();
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: roles } = useSupabaseTable<Role>("roles", { column: "name" });
  const { rows: staff } = useStaffProfiles();

  const resource = resources.find((r) => r.id === params.id) ?? null;

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [seededFor, setSeededFor] = useState<string | null>(null);

  /*
   * Seed local drafts when the row identity changes. Adjusted during render
   * rather than in an effect: React re-runs the component before committing,
   * so there's no flash of the previous note and no second paint — and no
   * fight with the inputs for the cursor, since the hook's optimistic writes
   * hand back a new object on every save.
   */
  if (resource && seededFor !== resource.id) {
    setSeededFor(resource.id);
    setTitle(resource.title);
    setSummary(resource.summary ?? "");
  }

  const resourceId = resource?.id;
  const saveNote = useCallback(
    (next: { content: unknown[]; body: string }) => {
      if (resourceId) update(resourceId, next);
    },
    [resourceId, update]
  );

  const tags = useMemo(() => resource?.tags ?? [], [resource?.tags]);

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
  const clientName = clients.find((c) => c.id === resource.client_id)?.company;
  const projectName = projects.find((p) => p.id === resource.project_id)?.name;

  async function commit(patch: Record<string, unknown>) {
    if (resource) await update(resource.id, patch);
  }

  async function saveTitle() {
    if (!resource) return;
    const next = title.trim();
    // An untitled note is unfindable, so an emptied field reverts rather than
    // saving. Keeping the old value beats a row you can't search for.
    if (!next || next === resource.title) return setTitle(resource.title);
    await commit({ title: next });
  }

  async function saveSummary() {
    if (!resource) return;
    const next = summary.trim();
    if (next === (resource.summary ?? "")) return;
    await commit({ summary: next || null });
  }

  async function setVisibility(visibility: ResourceVisibility) {
    if (!resource) return;
    // Clear the other list when switching. Leaving stale ids behind means a
    // toggle back silently restores a set you'd forgotten about — the wrong
    // kind of surprise on a permissions control.
    await commit({
      visibility,
      visible_role_ids: visibility === "roles" ? resource.visible_role_ids : [],
      visible_to: visibility === "people" ? resource.visible_to : [],
    });
  }

  async function toggleRole(roleId: string) {
    if (!resource) return;
    const on = resource.visible_role_ids.includes(roleId);
    await commit({
      visible_role_ids: on
        ? resource.visible_role_ids.filter((id) => id !== roleId)
        : [...resource.visible_role_ids, roleId],
    });
  }

  async function togglePerson(profileId: string) {
    if (!resource) return;
    const on = resource.visible_to.includes(profileId);
    await commit({
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

  const restricted = resource.visibility !== "everyone";
  const audienceCount =
    resource.visibility === "roles"
      ? resource.visible_role_ids.length
      : resource.visible_to.length;

  return (
    /*
     * -m-3/-m-4/-m-6 cancels the dashboard shell's padding so the page runs
     * edge to edge like a document, then puts its own generous padding back.
     * Without this the note sits in a box within a box — which is what "inside
     * a container" was describing.
     */
    <div className="-m-3 flex min-h-full flex-col sm:-m-4 md:-m-6">
      {/* Page actions sit outside the reading column, quiet until needed. */}
      <div className="flex items-center justify-between px-6 pb-2 pt-4 md:px-10">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Resources
        </Link>

        {canEdit && (
          <div className="flex items-center gap-0.5">
            <IconAction
              title={resource.pinned ? "Unpin" : "Pin to the top of the list"}
              active={resource.pinned}
              onClick={() => commit({ pinned: !resource.pinned })}
            >
              <Pin className={cn("h-3.5 w-3.5", resource.pinned && "fill-current")} />
            </IconAction>
            <IconAction title="Delete" danger onClick={destroy}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconAction>
          </div>
        )}
      </div>

      {/* The document. 900px is Notion's measure — wide enough for a table,
          narrow enough that prose doesn't run away from the eye. */}
      {/*
        1200px, not 900. 900 is Notion's measure for a centred page on a wide
        monitor; inside this app's panel it left a third of the width empty and
        read as "not full width".

        md:px-14 is not decoration either — the editor's block controls live in
        a 54px gutter that hangs left of the text, and this padding is the room
        they hang into. Shrink it and the + button gets clipped again.
      */}
      <div className="mx-auto w-full max-w-[1200px] px-6 pb-32 pt-6 md:px-14">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15">
            {isNote ? (
              <FileText className="h-4 w-4 text-primary" />
            ) : (
              <Link2 className="h-4 w-4 text-primary" />
            )}
          </div>
        </div>

        {canEdit ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            aria-label="Title"
            placeholder="Untitled"
            className="w-full bg-transparent text-[36px] font-bold leading-[1.15] tracking-tight text-foreground outline-none placeholder:text-muted-2"
          />
        ) : (
          <h1 className="text-[36px] font-bold leading-[1.15] tracking-tight">
            {resource.title}
          </h1>
        )}

        {canEdit ? (
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={saveSummary}
            aria-label="Summary"
            placeholder="Add a one-line summary…"
            className="mt-2 w-full bg-transparent text-[15px] text-muted-foreground outline-none placeholder:text-muted-2"
          />
        ) : (
          resource.summary && (
            <p className="mt-2 text-[15px] text-muted-foreground">{resource.summary}</p>
          )
        )}

        {/* Properties — quiet rows, not a form. */}
        <div className="mt-6 flex flex-col gap-0.5">
          <PropRow icon={Tag} label="Tags">
            {canEdit ? (
              <TagField key={resource.id} tags={tags} onSave={(t) => commit({ tags: t })} />
            ) : tags.length > 0 ? (
              <div className="flex flex-wrap gap-1 py-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[11.5px] text-foreground-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </PropRow>

          <PropRow icon={Building2} label="Client">
            {canEdit ? (
              <GhostSelect
                value={resource.client_id ?? ""}
                onChange={(v) => commit({ client_id: v || null })}
                options={[
                  { value: "", label: "Empty" },
                  ...clients.map((c) => ({ value: c.id, label: c.company })),
                ]}
              />
            ) : clientName ? (
              <PlainValue>{clientName}</PlainValue>
            ) : (
              <Empty />
            )}
          </PropRow>

          <PropRow icon={FolderKanban} label="Project">
            {canEdit ? (
              <GhostSelect
                value={resource.project_id ?? ""}
                onChange={(v) => commit({ project_id: v || null })}
                options={[
                  { value: "", label: "Empty" },
                  ...projects
                    .filter((p) => !p.archived)
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            ) : projectName ? (
              <PlainValue>{projectName}</PlainValue>
            ) : (
              <Empty />
            )}
          </PropRow>

          {canEdit && (
            <PropRow icon={Eye} label="Visible to">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <GhostSelect
                  value={resource.visibility}
                  onChange={(v) => setVisibility(v as ResourceVisibility)}
                  options={RESOURCE_VISIBILITIES.map((v) => ({
                    value: v,
                    label: RESOURCE_VISIBILITY_LABELS[v],
                  }))}
                />

                {resource.visibility === "roles" && (
                  <AudiencePicker
                    chips={resource.visible_role_ids.map((id) => ({
                      id,
                      label: roles.find((r) => r.id === id)?.name ?? "Unknown role",
                    }))}
                    options={roles.map((r) => ({ id: r.id, label: r.name }))}
                    selected={resource.visible_role_ids}
                    onToggle={toggleRole}
                    menuLabel="Roles that can see this"
                  />
                )}

                {resource.visibility === "people" && (
                  <AudiencePicker
                    chips={resource.visible_to.map((id) => ({
                      id,
                      label: staff.find((p) => p.id === id)?.full_name ?? "Unknown",
                    }))}
                    options={staff.map((p) => ({ id: p.id, label: p.full_name }))}
                    selected={resource.visible_to}
                    onToggle={togglePerson}
                    menuLabel="People who can see this"
                  />
                )}

                {restricted && audienceCount === 0 && (
                  <span className="text-[11.5px] text-warning">
                    nobody picked — admin-only
                  </span>
                )}
              </div>
            </PropRow>
          )}

          <PropRow icon={CalendarDays} label="Updated">
            <PlainValue>{formatDate(resource.updated_at)}</PlainValue>
          </PropRow>
        </div>

        {/* Body — flows straight on. Notion has no rule here and no container;
            the change in type size is the separation. */}
        <div className="mt-8">
          {isNote ? (
            /*
              key={resource.id} is doing real work. Plate reads `value` once, at
              construction, and ignores it after — correctly, since re-seeding a
              live editor would stomp whatever was just typed. Remounting is the
              only way to switch notes.
            */
            <NoteEditor
              key={resource.id}
              content={resource.content}
              markdown={resource.body}
              editable={canEdit}
              onSave={saveNote}
            />
          ) : canEdit ? (
            <UrlField key={resource.id} value={resource.url ?? ""} onSave={(url) => commit({ url })} />
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
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function IconAction({
  title,
  onClick,
  active,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 transition-colors",
        active
          ? "text-warning hover:bg-warning/10"
          : danger
            ? "text-muted-foreground hover:bg-danger/10 hover:text-danger"
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Label left, value right, both at body scale. The row is the hover target. */
function PropRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    /*
      No hover tint on the row at all.

      Capping it at 560px still lit a 560px band when you pointed anywhere
      near a label, which reads as selecting a region rather than as "this
      value is editable". Notion doesn't tint the row either — only the
      control responds, which is what `.ghost-select` and the tag field
      already do on their own.
    */
    <div className="flex min-h-[32px] max-w-[560px] items-start gap-3">
      <div className="flex w-[104px] shrink-0 items-center gap-1.5 pt-[7px] text-[13px] text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-2" />}
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PlainValue({ children }: { children: React.ReactNode }) {
  return <span className="block py-[7px] text-[13px] text-foreground-secondary">{children}</span>;
}

function Empty() {
  return <span className="block py-[7px] text-[13px] text-muted-2">Empty</span>;
}

/**
 * A select that reads as text until you hover it.
 *
 * Wraps the app's Dropdown rather than restyling a native select, so the menu
 * still matches every other menu in the CRM — only the trigger goes quiet.
 */
function GhostSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="ghost-select -ml-1 max-w-[280px]">
      <Dropdown value={value} options={options} onChange={onChange} placeholder="Empty" />
    </div>
  );
}

/** Chips plus an inline input. Enter or comma commits; Backspace on an empty
 *  field removes the last, which is what every tag field has always done. */
function TagField({ tags, onSave }: { tags: string[]; onSave: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const next = draft.trim().toLowerCase();
    setDraft("");
    if (!next || tags.includes(next)) return;
    onSave([...tags, next]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 py-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="group/tag flex items-center gap-1 rounded bg-white/5 py-0.5 pl-1.5 pr-1 text-[11.5px] text-foreground-secondary"
        >
          {t}
          <button
            type="button"
            onClick={() => onSave(tags.filter((x) => x !== t))}
            className="rounded-sm text-muted-2 opacity-0 transition-opacity hover:text-foreground group-hover/tag:opacity-100"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            onSave(tags.slice(0, -1));
          }
        }}
        placeholder={tags.length === 0 ? "Empty" : ""}
        className="min-w-[90px] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-muted-2"
      />
    </div>
  );
}

function UrlField({ value, onSave }: { value: string; onSave: (url: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = normaliseUrl(text);
          if (next && next !== value) onSave(next);
        }}
        placeholder="https://…"
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-1.5 text-sm text-primary outline-none hover:border-border focus:border-primary/50"
      />
      {value && (
        <a
          href={normaliseUrl(value)}
          target="_blank"
          rel="noopener noreferrer"
          title="Open"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function AudiencePicker({
  chips,
  options,
  selected,
  onToggle,
  menuLabel,
}: {
  chips: { id: string; label: string }[];
  options: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  menuLabel: string;
}) {
  return (
    <>
      {chips.map((c) => (
        <span
          key={c.id}
          className="group/chip flex items-center gap-1 rounded bg-white/5 py-0.5 pl-1.5 pr-1 text-[11.5px] text-foreground-secondary"
        >
          {c.label}
          <button
            type="button"
            onClick={() => onToggle(c.id)}
            className="rounded-sm text-muted-2 opacity-0 transition-opacity hover:text-foreground group-hover/chip:opacity-100"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <Popover
        trigger={
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
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
    </>
  );
}
