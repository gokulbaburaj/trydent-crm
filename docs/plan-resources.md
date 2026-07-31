# Resources — build plan

Decisions taken, 1 Aug 2026:

| Question | Answer |
| --- | --- |
| What goes in it | Process notes / SOPs, links to tutorials, client-specific reference |
| Uploaded files | **Not in v1** |
| Who writes | Admin only — you create, edit, delete |
| Who reads | Admin decides, per resource |
| Organising | Tags + search. No folders. |

Two of those answers change the shape of the thing considerably, so they're
worth restating before the schema.

**No file uploads means no Storage bucket, no signed URLs, no MIME handling,
no upload progress, no orphaned-object cleanup.** That's most of the surface
area gone. If you want files later they slot in as a third `kind` without
touching anything below.

**Per-resource visibility is the load-bearing requirement.** "Admin manages
who can see" isn't a page grant — the existing `roles.pages` system decides
whether someone reaches `/resources` at all, and that's still needed, but it
can't express "the whole team sees the SOP, only Design sees the rate card."
That has to live on the row and be enforced by RLS, not by hiding things in
the UI. A client-facing rate card that's merely `display: none` is a rate card
you've published.

---

## Schema

```sql
create type resource_kind as enum ('note', 'link');
create type resource_visibility as enum ('everyone', 'roles', 'people');

create table resources (
  id          uuid primary key default gen_random_uuid(),
  kind        resource_kind not null,

  title       text not null,
  summary     text,                    -- one line, shown in the list
  body        text,                    -- markdown; kind = 'note'
  url         text,                    -- kind = 'link'

  tags        text[] not null default '{}',

  -- Optional scoping. Most resources are company-wide and leave both null.
  client_id   uuid references clients(id)  on delete set null,
  project_id  uuid references projects(id) on delete set null,

  -- Visibility. See the note below on why this is three columns.
  visibility     resource_visibility not null default 'everyone',
  visible_roles  text[] not null default '{}',   -- role names, visibility='roles'
  visible_to     uuid[] not null default '{}',   -- profile ids, visibility='people'

  pinned      boolean not null default false,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A note needs a body, a link needs a url. Enforced here rather than
  -- trusted to the form, because the form is not the only way in.
  constraint resource_shape check (
    (kind = 'note' and body is not null) or
    (kind = 'link' and url  is not null)
  )
);

create index resources_tags_idx       on resources using gin (tags);
create index resources_client_idx     on resources (client_id);
create index resources_project_idx    on resources (project_id);
create index resources_visible_to_idx on resources using gin (visible_to);
create index resources_search_idx     on resources using gin (
  to_tsvector('english', title || ' ' || coalesce(summary,'') || ' ' || coalesce(body,''))
);
```

### Why visibility is three columns and not one

The tempting design is a single `visible_to uuid[]` and always list people.
It's wrong for this team: you'd re-list everyone by hand each time somebody
joins, and every existing resource would silently stay invisible to the new
hire. Roles are the level you actually think at ("Design sees this"), so roles
need to be first-class. `everyone` is separate from an empty roles array
because those mean opposite things, and conflating them is how a resource ends
up visible to nobody by accident.

`people` exists for the one-off — a doc for two specific contractors — and it's
the exception, not the mechanism.

---

## RLS

Four policies. Writes are trivial; the read policy is the whole feature.

```sql
alter table resources enable row level security;

-- Admin does everything.
create policy resources_admin_all on resources
  for all to authenticated
  using ((select current_is_admin()))
  with check ((select current_is_admin()));

-- Everyone else reads what they've been given.
create policy resources_read on resources
  for select to authenticated
  using (
    (select current_is_admin())
    or visibility = 'everyone'
    or (visibility = 'roles'  and (select current_role_name()) = any(visible_roles))
    or (visibility = 'people' and (select auth.uid()) = any(visible_to))
  );
```

Helper calls are wrapped in `(select …)` so Postgres evaluates them once as an
InitPlan rather than per row — the same fix as migration `2026-07-31c`. Doing
it right the first time here rather than adding another row to that audit.

Client portal users get nothing: they have no role name in `roles`, so every
branch of the read policy is false for them. That's the correct default, and
it's enforced by the database rather than by remembering to filter in the UI.

**Test it before trusting it.** `set local role authenticated` with a forged
`request.jwt.claims` for one profile per role, then select and count. Four
selects, five minutes, and it's the difference between a visibility feature
and the appearance of one.

---

## Pages

### `/resources` — the list

```
┌──────────────────────────────────────────────────────────┐
│  Search…                    [All] [Notes] [Links]  + New │
│  Tags: design  pricing  onboarding  clients  ×clear      │
├──────────────────────────────────────────────────────────┤
│  📌  Pinned                                              │
│      How we quote a video project      SOP · pricing     │
│      Client handover checklist         SOP               │
├──────────────────────────────────────────────────────────┤
│      After Effects — expressions       tutorial · motion │
│      Wilson Flour Mills brand guide    Wilson · brand    │
│      …                                                   │
└──────────────────────────────────────────────────────────┘
```

Reuses what exists: `FilterBar` for search and saved views, `DataTable` with
`pageSize={15}` and fixed column widths so it matches every other list page.
Tag chips are a filter row above the table, multi-select, AND-combined.

Columns: Title (with kind icon), Tags, Linked to (client or project), Updated,
Visibility. That last one earns its place — an admin needs to see at a glance
which rows are restricted without opening each one.

A link row opens the URL in a new tab directly from the list. Making you open
a detail page to reach a bookmark is a detail page nobody wants.

### `/resources/[id]` — the note

Markdown body with a live preview, title, summary, tags, optional client and
project, and the visibility control. Read-only for non-admins — same page, no
editor chrome, no second component to keep in sync.

**Markdown, not a rich-text editor.** Markdown is diffable, pastes cleanly
into a message or a commit, and survives being copied out of the app. A
WYSIWYG means fighting `contenteditable` for a month and owning its bugs
forever. If it needs to look nicer later, the rendering changes and the stored
format doesn't.

### The visibility control

One dropdown, three states, and the picker only appears when it's relevant:

```
Visible to:  ( Everyone ▾ )
             ( Specific roles ▾ )  → [Design ×] [Video Editing ×] + Add
             ( Specific people ▾ ) → [Anjali ×] [Gokul ×] + Add
```

Default `everyone`. Most resources are for everybody, and a system that makes
you think about permissions to save a note is a system where notes don't get
saved.

---

## What's deliberately not in v1

- **File uploads.** Your call, and the right one — it removes most of the
  build. Slots in later as `kind = 'file'` plus a private bucket.
- **Folders.** You chose tags, and tags are the better fit: a rate card is
  both `pricing` and `design`, and a folder makes you pick one.
- **Versioning and comments.** Real features, neither of them the reason this
  page exists.
- **Client portal sharing.** Client documents already have their own table and
  their own rules. Merging the two is the fastest route to an internal pricing
  sheet appearing in someone's portal.
- **Rich embeds / link previews.** Needs an unfurl service and a scraping
  budget. A title and a tag find the link fine.

---

## Build sequence

1. **Migration** — enums, table, indexes, RLS. Written to a file, run by you,
   verified with the four forged-JWT selects.
2. **Types** — `Resource`, `ResourceKind`, `ResourceVisibility` in `lib/types.ts`.
3. **`useResources` hook** — list, create, update, delete. Follows the existing
   `useSupabaseTable` shape so it inherits the same caching and optimistic
   patterns. (Same known limit: whole-table fetch. Fine at this size, and it's
   already the standing item in the audit.)
4. **`/resources` list** — FilterBar, DataTable, tag chips, kind filter, new-item
   popover.
5. **`/resources/[id]`** — markdown editor and preview, metadata sidebar,
   visibility control.
6. **Wiring** — sidebar nav, tab icons, ⌘K command menu, and the page picker in
   Settings → Roles so `/resources` can be granted like every other page.
7. **Verify** — `tsc`, `eslint`, and a manual pass as a non-admin to confirm a
   restricted resource is genuinely absent from the list rather than merely
   hidden.

Steps 1–3 are one sitting. Steps 4–5 are the bulk. Step 6 is half an hour and
is the one that's easy to forget, which is how a feature ends up shipped but
unreachable.

---

## Where this leads

Step 4 needs a picker that searches across clients and projects to set
`client_id` / `project_id`. That picker is the same component Channels needs
for `#` mentions. Building it here, against a feature where getting it wrong
costs nothing, is most of the reason to do Resources first.
