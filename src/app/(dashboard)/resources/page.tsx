"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  ExternalLink,
  FileText,
  Globe,
  Library,
  Link2,
  Lock,
  Pin,
  Plus,
  Tag,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Label } from "@/components/ui/Input";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { Drawer } from "@/components/ui/Drawer";
import { Dropdown } from "@/components/ui/Dropdown";
import { DataTable, Column } from "@/components/DataTable";
import { FilterBar } from "@/components/FilterBar";
import { RequireAccess } from "@/components/RequireAccess";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { useResources, urlHost, normaliseUrl } from "@/lib/useResources";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useTabs } from "@/lib/tabs";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_VISIBILITY_LABELS,
  type Client,
  type Project,
  type Resource,
  type ResourceKind,
} from "@/lib/types";

export default function ResourcesPage() {
  return (
    <RequireAccess page="resources">
      {/* useSearchParams needs a Suspense boundary in the App Router — the
          sidebar's quick-capture button arrives here as ?new=note. */}
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ResourcesInner />
      </Suspense>
    </RequireAccess>
  );
}

interface NewDraft {
  kind: ResourceKind;
  title: string;
  url: string;
  summary: string;
  tags: string;
  client_id: string;
  project_id: string;
}

const emptyDraft: NewDraft = {
  kind: "note",
  title: "",
  url: "",
  summary: "",
  tags: "",
  client_id: "",
  project_id: "",
};

function ResourcesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openInNewTab } = useTabs();
  const { resources, tagCounts, loading, canEdit, create } = useResources();
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: projects } = useSupabaseTable<Project>("projects");

  const { filters, views, setFilters, setViews } = useStoredFilters("resources");
  const [draft, setDraft] = useState<NewDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [handledParam, setHandledParam] = useState(false);

  /*
   * ?new=note / ?new=link opens the composer straight away — that's the
   * sidebar's quick-capture button landing here.
   *
   * Opened during render rather than in an effect, guarded by a flag so
   * closing the drawer doesn't immediately reopen it. An effect would paint
   * the list first and pop the modal a frame later, which reads as a glitch,
   * and it's the cascading-render pattern the lint rule catches.
   */
  const newParam = searchParams.get("new");
  if (!handledParam && canEdit && (newParam === "note" || newParam === "link")) {
    setHandledParam(true);
    setDraft({ ...emptyDraft, kind: newParam });
  }

  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.company ?? null;
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  /*
   * The `status` facet does double duty as the kind filter and `label` as tags.
   * Reusing FilterBar's existing facets rather than adding two more props: they
   * behave identically, they're already persisted per page, and they already
   * work with saved views. A "kind" prop would be the same code under a
   * different name.
   */
  const visible = useMemo(
    () =>
      applyFilters(resources, filters, {
        text: (r) => [r.title, r.summary, r.body, r.url, clientName(r.client_id)],
        status: (r) => RESOURCE_KIND_LABELS[r.kind],
        labels: (r) => r.tags ?? [],
        due: (r) => r.updated_at,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resources, filters, clients]
  );

  function toggleTag(tag: string) {
    const cur = filters.label;
    setFilters({
      ...filters,
      label: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    });
  }

  function open(r: Resource) {
    // A link is a bookmark. Making you open a detail page to reach it would be
    // a detail page nobody wants — so links go straight out, notes go in.
    if (r.kind === "link" && r.url) {
      window.open(normaliseUrl(r.url), "_blank", "noopener,noreferrer");
      return;
    }
    openInNewTab(`/resources/${r.id}`, r.title);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draft.title.trim()) return;
    setSaving(true);
    const row = await create({
      kind: draft.kind,
      title: draft.title,
      summary: draft.summary,
      url: draft.url,
      tags: draft.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      client_id: draft.client_id || null,
      project_id: draft.project_id || null,
    });
    setSaving(false);
    if (!row) return;
    setDraft(null);
    // Straight into the editor for a note — you made it to write in it.
    if (row.kind === "note") router.push(`/resources/${row.id}`);
  }

  const columns: Column<Resource>[] = [
    {
      header: "Title",
      icon: FileText,
      width: "34%",
      sortKey: (r) => r.title.toLowerCase(),
      render: (r) => (
        <div className="flex min-w-0 items-center gap-2">
          {r.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-warning" />}
          {r.kind === "link" ? (
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-2" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-2" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium" title={r.title}>
              {r.title}
            </p>
            {(r.summary || r.kind === "link") && (
              <p className="truncate text-[11.5px] text-muted-foreground">
                {r.summary || urlHost(r.url)}
              </p>
            )}
          </div>
          {r.kind === "link" && (
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-2 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </div>
      ),
    },
    {
      header: "Tags",
      icon: Tag,
      width: "22%",
      sortKey: (r) => (r.tags ?? []).join(","),
      render: (r) =>
        (r.tags ?? []).length === 0 ? (
          <span className="text-muted-2">—</span>
        ) : (
          <div className="flex gap-1 overflow-hidden">
            {r.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-foreground-secondary"
              >
                {t}
              </span>
            ))}
            {r.tags.length > 3 && (
              <span className="shrink-0 text-[11px] text-muted-2">+{r.tags.length - 3}</span>
            )}
          </div>
        ),
    },
    {
      header: "Linked to",
      icon: Building2,
      width: "18%",
      sortKey: (r) => clientName(r.client_id) ?? projectName(r.project_id) ?? "",
      render: (r) => {
        const label = clientName(r.client_id) ?? projectName(r.project_id);
        return label ? (
          <span className="text-muted-foreground">{label}</span>
        ) : (
          <span className="text-muted-2">Company-wide</span>
        );
      },
    },
    {
      header: "Visible to",
      icon: Lock,
      width: "150px",
      sortKey: (r) => r.visibility,
      // Earns its column: an admin needs to see which rows are restricted
      // without opening each one, and "did I set that right?" is the question
      // this page has to answer at a glance.
      render: (r) =>
        r.visibility === "everyone" ? (
          <span className="text-muted-2">Everyone</span>
        ) : (
          <Badge tone="yellow" dot>
            {r.visibility === "roles"
              ? `${r.visible_role_ids.length} role${r.visible_role_ids.length === 1 ? "" : "s"}`
              : `${r.visible_to.length} ${r.visible_to.length === 1 ? "person" : "people"}`}
          </Badge>
        ),
    },
    {
      header: "Updated",
      icon: Globe,
      width: "130px",
      sortKey: (r) => r.updated_at,
      render: (r) => <span className="text-muted-foreground">{formatDate(r.updated_at)}</span>,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Notes, SOPs and links worth keeping. Search it before asking someone.
        </p>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="h-4 w-4" /> New resource
          </Button>
        )}
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        views={views}
        onViewsChange={setViews}
        statuses={["Note", "Link"]}
        statusLabel="Kind"
        labels={tagCounts.map((t) => t.tag)}
        showDue
        dueLabel="Updated"
        placeholder="Search resources…"
      />

      {/* Tags as a chip row, not only a facet popover. The popover is for
          precision; this is for browsing — you can see what exists without
          opening anything, which is most of what a resources page is for.
          Ordered by use, because alphabetical tells you nothing. */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tagCounts.slice(0, 14).map(({ tag, count }) => {
            const on = filters.label.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                  on
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {tag}
                <span className="tabular-nums text-muted-2">{count}</span>
              </button>
            );
          })}
          {filters.label.length > 0 && (
            <button
              type="button"
              onClick={() => setFilters({ ...filters, label: [] })}
              className="px-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        onRowClick={open}
        pageSize={15}
        minWidth="900px"
        emptyMessage={
          loading ? (
            <TableSkeleton />
          ) : resources.length > 0 ? (
            "Nothing matches the current filters."
          ) : (
            <EmptyState
              icon={Library}
              title="Nothing here yet"
              description="Process notes, SOPs and the links you keep re-finding. Start with the one thing you explain most often."
              actionLabel={canEdit ? "New resource" : undefined}
              onAction={canEdit ? () => setDraft({ ...emptyDraft }) : undefined}
            />
          )
        }
      />

      <Drawer open={!!draft} onClose={() => setDraft(null)} title="New resource">
        {draft && (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <div>
              <Label>Kind</Label>
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
                {(["note", "link"] as ResourceKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraft({ ...draft, kind: k })}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                      draft.kind === k
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground-secondary"
                    )}
                  >
                    {k === "note" ? (
                      <FileText className="h-3.5 w-3.5" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                    {RESOURCE_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Title</Label>
              <Input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder={
                  draft.kind === "note" ? "How we quote a video project" : "After Effects expressions"
                }
                required
              />
            </div>

            {draft.kind === "link" && (
              <div>
                <Label>URL</Label>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="youtube.com/watch?v=…"
                  required
                />
              </div>
            )}

            <div>
              <Label>Summary</Label>
              <Input
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="One line — what this is for"
              />
            </div>

            <div>
              <Label>Tags</Label>
              <Input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="sop, pricing, design"
              />
              <p className="mt-1 text-[11px] text-muted-2">
                Comma separated. Lower-cased so “SOP” and “sop” stay one tag.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Client</Label>
                <Dropdown
                  value={draft.client_id}
                  onChange={(v) => setDraft({ ...draft, client_id: v })}
                  options={[
                    { value: "", label: "None" },
                    ...clients.map((c) => ({ value: c.id, label: c.company })),
                  ]}
                />
              </div>
              <div>
                <Label>Project</Label>
                <Dropdown
                  value={draft.project_id}
                  onChange={(v) => setDraft({ ...draft, project_id: v })}
                  options={[
                    { value: "", label: "None" },
                    ...projects
                      .filter((p) => !p.archived)
                      .map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            </div>

            {/* Visibility is deliberately absent from the create form. New
                resources are visible to everyone, and you change that on the
                detail page once the thing exists. Asking about permissions
                before the note is written is how notes don't get written. */}
            <p className="flex items-start gap-2 rounded-md border border-border-subtle bg-white/[0.02] px-3 py-2 text-[11.5px] text-muted-foreground">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-2" />
              Visible to {RESOURCE_VISIBILITY_LABELS.everyone.toLowerCase()} to start. You can
              restrict it after it&apos;s created.
            </p>

            <div className="flex justify-end gap-2 border-t border-border pt-3.5">
              <Button variant="ghost" size="sm" type="button" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
