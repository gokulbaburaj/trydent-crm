# Plan — Resources, then Channels

Two features, deliberately sequenced. Resources first: it's smaller, it has no
realtime moving parts, and it gives Channels something worth linking to.

---

## Feature 1 — Resources

### What it is

A place for the things that currently have nowhere to live: process notes,
useful documents, links to tutorials, brand assets, pricing references. Today
they're in someone's head, a Notion page nobody opens, or a WhatsApp message.

### The design decision worth making up front

**One table, three kinds of item, not three features.** A note, an uploaded
file and a link are the same object as far as the user is concerned — "a thing
I want to find again". Splitting them into separate tables and separate pages
means three search boxes and three empty states. One list, filtered by kind.

### Schema

```sql
create table resources (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('note','file','link')),
  title        text not null,
  body         text,          -- markdown, for kind='note'
  url          text,          -- for kind='link'
  storage_path text,          -- for kind='file', private bucket
  file_name    text,
  file_size    bigint,
  mime_type    text,
  folder_id    uuid references resource_folders(id) on delete set null,
  tags         text[] not null default '{}',
  pinned       boolean not null default false,
  client_id    uuid references clients(id) on delete set null,
  project_id   uuid references projects(id) on delete set null,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table resource_folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  parent_id  uuid references resource_folders(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

Indexes on `folder_id`, `client_id`, `project_id`, plus a GIN index on `tags`
and a `tsvector` index over `title || body` for search. Both `client_id` and
`project_id` are nullable and optional — most resources are company-wide.

RLS: readable by any authenticated staff member, writable per the existing
`current_can('resources')` grant. Client portal users get **nothing** here by
default; client-facing documents already have their own table and their own
sharing rules, and merging the two would be the fastest way to leak an
internal pricing sheet.

Storage: reuse the private-bucket pattern from `lib/storage.ts` with a new
`resources` bucket and signed URLs.

### Pages

- `/resources` — the list. Sidebar of folders on the left, items on the right.
  Filter chips for kind and tag, a search box wired to the tsvector index,
  pinned items floated to the top. Grid or list view, same `useViewPreference`
  hook the other pages use.
- `/resources/[id]` — a note opens as a full editor page; a file opens a
  preview with a download button; a link just navigates out. Same route, three
  bodies.

### Editor

Markdown with a live preview, not a rich-text WYSIWYG. Reasons: markdown is
diffable, pasteable, and survives being copied into Slack or a commit message.
A WYSIWYG means fighting `contenteditable` for a month and owning the bug
reports forever. If the editor needs to be prettier later, the stored format
doesn't have to change.

### Scope cut for v1

No versioning, no comments, no per-item permissions, no client sharing. Each
of those is a real feature and none of them is why the page exists.

### Rough sequence

1. Migration + `Resource` / `ResourceFolder` types
2. `useResources` hook (list, create, update, delete, upload)
3. `/resources` list page with folders, filters, search
4. `/resources/[id]` detail with the markdown editor
5. Register in nav, tabs, tab icons, command menu, and the roles page picker

---

## Feature 2 — Channels

### What it is

Discord-style chat inside the CRM. Persistent named channels, threads, and —
the part that justifies building it rather than using Slack — **first-class
references to the objects already in the system.**

### Why build it at all

An honest question, since Slack exists and is better at chat. The answer is
the linking. A message that says "the Wilson deck is late" is worth nothing in
six months. A message that renders `#social-media-content` as a live project
chip, and lets you turn the message into a task in one click, is a record of
why a decision was made, attached to the thing it was about. Slack cannot do
that against this database.

If that linking isn't built, this is a worse Slack and shouldn't ship.

### Schema

```sql
create table channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- url-safe, unique
  topic       text,
  kind        text not null default 'public'
              check (kind in ('public','private','dm')),
  project_id  uuid references projects(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  archived    boolean not null default false,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create table channel_members (
  channel_id uuid references channels(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  muted      boolean not null default false,
  primary key (channel_id, profile_id)
);

create table messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references channels(id) on delete cascade,
  parent_id   uuid references messages(id) on delete cascade,  -- thread reply
  author_id   uuid references profiles(id),
  body        text not null,
  mentions    jsonb not null default '[]',  -- resolved refs, see below
  edited_at   timestamptz,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table message_reactions (
  message_id uuid references messages(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  emoji      text not null,
  primary key (message_id, profile_id, emoji)
);
```

Index `messages (channel_id, created_at desc)` — that's the only query the
channel view ever makes, and it's the one that has to stay fast.

### Mentions, the actual feature

Store the body as plain text with inline markers, and store the resolved
references alongside:

```
body:     "blocked on @[profile:8f2…] finishing #[project:1a4…]"
mentions: [
  {"type":"profile","id":"8f2…","label":"Anjali"},
  {"type":"project","id":"1a4…","label":"Social Media Content"}
]
```

Denormalising the label matters. A message should still read sensibly after
the project is renamed or the person leaves — the chip links to whatever
exists now, but the text records what was said then.

Reference types: `profile`, `project`, `task`, `client`, `deal`, `resource`.
Typing `@` opens the people picker; `#` opens a picker across everything else,
reusing the ⌘K search index rather than building a second one.

### Shortcuts and actions

The point of the integration, in rough priority order:

1. Hover a chip → preview card (status, owner, due date) without navigating
2. Message → "Create task" — opens the task composer prefilled with the body
   and any project reference already resolved
3. `/task`, `/meeting`, `/note` slash commands in the composer
4. Auto-created project channels: turning on chat for a project makes
   `#project-name` with the project members already in it
5. A "Discussion" tab on the project page rendering that channel inline, so
   the conversation lives next to the work rather than in a separate app

### Realtime

Supabase Realtime on `messages`, filtered by `channel_id`. Optimistic insert
locally with a client-generated id so the message appears instantly and
reconciles when the insert returns. Unread counts come from
`channel_members.last_read_at` compared against `max(created_at)` — cheap, and
it survives across devices.

### The hard parts, named honestly

- **Realtime plus RLS.** Realtime respects RLS, so a private channel's
  policies must be right before anyone trusts it. Test with a forged JWT the
  way the `roles` policies were tested, not by clicking around.
- **Message volume.** This is the first table that grows without bound. It
  needs cursor pagination from day one — `useSupabaseTable` fetching the
  whole table is already the standing problem in the audit and it would be
  actively broken here.
- **Notification fan-out.** A mention should reach the existing notifications
  bell. Doing that per-message in the client is a race; it belongs in a
  database trigger or an edge function.
- **Nobody uses it.** The real failure mode. The team already talks somewhere.
  Chat that duplicates WhatsApp with fewer features loses. The integration
  points above are the only reason to switch, so they ship in v1 or the
  feature doesn't.

### Rough sequence

1. Migration + types + RLS, tested against each role
2. `useChannel(channelId)` hook: paginated history, realtime subscription,
   optimistic send
3. `/channels` shell: channel list, message list, composer
4. Mention parser, picker, and chip renderer
5. Message actions: create task, react, reply in thread
6. Project channels and the project-page Discussion tab
7. Unread counts, notification trigger, nav badge

---

## Order

Resources first — one table, no realtime, and it stands on its own. Channels
second, and only with the linking. Reassess after Resources ships: if the
team doesn't use Resources, Channels is unlikely to fare better, and that's
useful information to have before spending the larger effort.
