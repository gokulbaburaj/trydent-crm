-- Trydent Labs CRM — Channels (step 1: schema, RLS, realtime)
--
-- Discord-style chat, but the reason it exists is the object linking: a message
-- that renders #project as a live chip and turns into a task in one click. See
-- docs/plan-channels.md.
--
-- This migration is schema + policies only. No UI depends on it yet, so it is
-- safe to apply ahead of the client code.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  topic       text,
  kind        text not null default 'public'
              check (kind in ('public', 'private', 'dm')),
  -- A channel may hang off a project or a client. Both null is a general
  -- channel (#general, #random). Cascade: if the project dies so does its
  -- channel, because a project channel with no project is just orphaned chat.
  project_id  uuid references public.projects(id) on delete cascade,
  client_id   uuid references public.clients(id) on delete cascade,
  archived    boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Named channels are unique case-insensitively; DMs are exempt because they
-- have no meaningful name (they're identified by their two members).
create unique index if not exists channels_name_key
  on public.channels (lower(name)) where kind <> 'dm';

create table if not exists public.channel_members (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  -- Unread counts compare this against max(messages.created_at). Cheap, and it
  -- follows the person across devices rather than living in localStorage.
  last_read_at timestamptz not null default now(),
  muted        boolean not null default false,
  primary key (channel_id, profile_id)
);

create index if not exists channel_members_profile_idx
  on public.channel_members (profile_id);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  -- Thread replies point at their root message.
  parent_id  uuid references public.messages(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  body       text not null,
  /*
   * Resolved references, denormalised on purpose:
   *   [{"type":"project","id":"1a4…","label":"Social Media"}]
   * The label is a snapshot. Rename the project and the chip still links to
   * the live record, but the sentence keeps saying what was actually said.
   */
  mentions   jsonb not null default '[]'::jsonb,
  edited_at  timestamptz,
  -- Soft delete: hard-deleting a thread root would take its replies with it.
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

/*
 * The only query the channel view makes, and the one that must stay fast.
 * Messages are the first table here that grows without bound, so this is
 * read as: newest N in a channel, then keep paging backwards by created_at.
 */
create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at desc);

create index if not exists messages_parent_idx
  on public.messages (parent_id) where parent_id is not null;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id, emoji)
);


-- ============================================================================
-- 2. Helpers
-- ============================================================================
-- SECURITY DEFINER is doing real work here, not ceremony.
--
-- `channels` needs to ask "is the caller a member" and `channel_members` needs
-- to ask "can the caller see this channel". Written as plain subqueries in the
-- policies, each table's policy would trigger the other's, and Postgres would
-- abort with infinite recursion. A SECURITY DEFINER function runs as the owner
-- and therefore does not re-enter RLS, which breaks the cycle.
--
-- They live in `private` so PostgREST can't expose them, matching the other
-- eight helpers.

create or replace function private.is_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.channel_members m
    where m.channel_id = p_channel_id
      and m.profile_id = auth.uid()
  );
$$;

create or replace function private.can_see_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.channels c
    where c.id = p_channel_id
      -- Clients never reach chat, whatever else is true. Their portal is a
      -- different surface and internal chatter is not part of it.
      and private.current_role_name() <> 'client'
      and private.current_can('channels')
      and (
        c.kind = 'public'
        -- The creator always keeps sight of what they made. Without this,
        -- creating a private channel and forgetting to add yourself makes it
        -- unreachable by everyone, recoverable only by an admin in SQL.
        -- Found by testing, not by reading: the first policy draft locked the
        -- author out of their own channel.
        or c.created_by = auth.uid()
        or private.is_channel_member(c.id)
      )
  );
$$;


-- ============================================================================
-- 3. RLS
-- ============================================================================

alter table public.channels          enable row level security;
alter table public.channel_members   enable row level security;
alter table public.messages          enable row level security;
alter table public.message_reactions enable row level security;

-- Channels ------------------------------------------------------------------

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
for select using (
  private.current_role_name() <> 'client'
  and (select private.current_can('channels'))
  and (
    kind = 'public'
    or created_by = auth.uid()
    or (select private.is_channel_member(id))
  )
);

-- Anyone who can reach chat can start a channel. Deliberately not admin-only:
-- needing permission to open a conversation is how a chat tool dies.
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels
for insert with check (
  private.current_role_name() <> 'client'
  and (select private.current_can('channels'))
  and created_by = auth.uid()
);

-- Renaming, setting a topic and archiving stay with the creator or an admin.
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels
for update using (
  (select private.current_is_admin()) or created_by = auth.uid()
);

drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels
for delete using (
  (select private.current_is_admin()) or created_by = auth.uid()
);

-- Membership ----------------------------------------------------------------

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
for select using ((select private.can_see_channel(channel_id)));

-- Join a public channel yourself; anyone already inside can add someone to a
-- private one.
drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members
for insert with check ((select private.can_see_channel(channel_id)));

-- `last_read_at` and `muted` are yours alone — this is also what stops one
-- person marking someone else's channel read.
drop policy if exists channel_members_update on public.channel_members;
create policy channel_members_update on public.channel_members
for update using (profile_id = auth.uid());

drop policy if exists channel_members_delete on public.channel_members;
create policy channel_members_delete on public.channel_members
for delete using (
  profile_id = auth.uid() or (select private.current_is_admin())
);

-- Messages ------------------------------------------------------------------

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
for select using ((select private.can_see_channel(channel_id)));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
for insert with check (
  (select private.can_see_channel(channel_id))
  and author_id = auth.uid()
);

-- Edit and delete your own words, nobody else's. Admins are NOT exempt on
-- update: silently rewriting what someone said is worse than any moderation
-- problem it solves. Admins can delete.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
for update using (author_id = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
for delete using (
  author_id = auth.uid() or (select private.current_is_admin())
);

-- Reactions -----------------------------------------------------------------

drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
for select using (
  (select private.can_see_channel(
     (select m.channel_id from public.messages m where m.id = message_id)
   ))
);

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
for insert with check (
  profile_id = auth.uid()
  and (select private.can_see_channel(
         (select m.channel_id from public.messages m where m.id = message_id)
       ))
);

drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
for delete using (profile_id = auth.uid());


-- ============================================================================
-- 4. Realtime
-- ============================================================================
-- Realtime respects RLS, so the policies above are what keep a private channel
-- private on the socket as well as on the wire.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end$$;


-- ============================================================================
-- 5. Page grants
-- ============================================================================
-- Admin reaches every page through the account floor, so its `pages` array is
-- untouched.
--
-- Freelancer is deliberately skipped. `isPortalOnly` is DERIVED — it means
-- "holds staff-portal and no real staff page bar settings". Granting channels
-- to Freelancer would silently stop them being portal-only and drop them into
-- the full app. If freelancers should have chat, that's a real decision about
-- the portal, not a page grant.

update public.roles
set pages = array_append(pages, 'channels')
where name in ('Design', 'Manager', 'Video Editing')
  and not ('channels' = any(pages));


-- ============================================================================
-- Verify
-- ============================================================================
--   select tablename, count(*) from pg_policies
--    where schemaname='public'
--      and tablename in ('channels','channel_members','messages','message_reactions')
--    group by 1;                       -- expect 4 / 4 / 4 / 3
--
--   select name, pages from public.roles order by name;
--
--   select tablename from pg_publication_tables
--    where pubname='supabase_realtime' and tablename='messages';
