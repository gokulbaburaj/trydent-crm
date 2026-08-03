# Channels — build plan

Notes moved back to Notion and the Resources feature was deleted (2 Aug 2026).
This is the half of that plan worth keeping.

One thing carried over from the deleted work: **`src/lib/useMentionables.ts`
survives.** It's the picker that resolves `@` against real people, projects and
clients, and it has no dependency on the note editor. That's most of item 4
below already built and working.

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

### Progress — 3 Aug

**Steps 1–3 done.** Schema, RLS, types, `useChannel`, and the `/channels` shell
(channel list, message list, composer) are in and deployed-ready.

Two decisions overrode the plan above:

- **No private channels, no DMs.** Every channel is open to everyone holding
  the `channels` grant. This deleted the membership-gating apparatus entirely —
  the SECURITY DEFINER helpers existed only to stop `channels` and
  `channel_members` policies recursing into each other, and the "can the
  founder read a private channel he isn't in" question had no good answer.
  `channel_members` now means sidebar + unread + mute, never access.
  Migration `2026-08-03b`.
- **Freelancers get chat without leaving the portal.** `isPortalOnly` is
  derived, so an ordinary page grant would have promoted them into the full
  CRM. `channels` instead joins `settings` in `PORTAL_COMPATIBLE` — pages that
  everyone needs and that don't imply app access.

RLS was tested with forged JWTs per role, not by clicking. It caught one real
bug: the first draft let a creator lock themselves out of their own channel.
That policy is gone now along with the rest of the private-channel machinery,
but the test is the reason it never shipped. Verified blocked: clients reading
or posting anything, posting under another person's name, editing someone
else's message.

### Still to build

4. Mention parser, picker, chip renderer — `useMentionables` is already there
5. Message actions: create task from message, react, reply in thread
6. Project channels and the project-page Discussion tab
7. Unread counts, notification trigger, nav badge
8. A chat surface inside the staff portal, so freelancers can actually reach it

Item 4 is the one that matters. The bar set below still holds: the object
linking is the whole justification. Without it this is a worse Slack.

### Rough sequence

1. Migration + types + RLS, tested against each role
2. `useChannel(channelId)` hook: paginated history, realtime subscription,
   optimistic send
3. `/channels` shell: channel list, message list, composer
4. Mention parser, picker, and chip renderer
5. Message actions: create task, react, reply in thread
6. Project channels and the project-page Discussion tab
7. Unread counts, notification trigger, nav badge
