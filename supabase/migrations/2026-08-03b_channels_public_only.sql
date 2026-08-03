-- Trydent Labs CRM — Channels are groups only, never private
--
-- Amends 2026-08-03a. Apply after it. Safe to re-run.
--
-- Why
-- ---
-- Every channel is visible to everyone who can reach chat. There are no
-- private channels and no DMs.
--
-- This is a smaller feature and a better one. Private channels dragged in a
-- whole apparatus: membership had to gate visibility, which meant `channels`
-- and `channel_members` policies each needed to consult the other, which meant
-- SECURITY DEFINER helpers purely to stop Postgres recursing. It also created
-- a question with no good answer — can the founder read a private channel he
-- isn't in? Yes is surveillance, no means an abandoned channel needs SQL to
-- recover.
--
-- Deleting the feature deletes all of it. Membership now means only "this is
-- in my sidebar and I have unread counts for it", never "I am allowed to see
-- it". A six-person team that needs a private conversation has a phone.
--
-- The one real cost: no DMs. That traffic goes to whatever the team already
-- uses, which is where it lives today anyway.


-- ============================================================================
-- 1. Drop the kind column
-- ============================================================================
-- Nothing is stored yet (verified: 0 rows) so there is no data to migrate.
--
-- Order matters: a policy that references `kind` pins the column, and Postgres
-- refuses the drop with "other objects depend on it". The policies come first.

drop policy if exists channels_select on public.channels;
drop policy if exists channels_insert on public.channels;
drop policy if exists channel_members_select on public.channel_members;
drop policy if exists channel_members_insert on public.channel_members;

drop index if exists public.channels_name_key;

alter table public.channels drop column if exists kind;

-- Names are unique case-insensitively across the board now that there's no
-- nameless DM case to carve out.
create unique index if not exists channels_name_key
  on public.channels (lower(name));


-- ============================================================================
-- 2. Simplify the helpers
-- ============================================================================
-- `is_channel_member` is gone: nothing gates on membership any more, so the
-- only thing it could do is mislead the next person into thinking it does.
--
-- `can_see_channel` stays because the message policies read better for it, but
-- it no longer touches channel_members, which means the recursion risk that
-- forced SECURITY DEFINER is gone too. It's kept DEFINER only so it can read
-- `profiles` and `roles` without needing its own policies on them.

drop function if exists private.is_channel_member(uuid);

create or replace function private.can_see_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select private.current_role_name() <> 'client'
     and private.current_can('channels')
     and exists (select 1 from public.channels c where c.id = p_channel_id);
$$;


-- ============================================================================
-- 3. Policies
-- ============================================================================

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels
for select using (
  private.current_role_name() <> 'client'
  and (select private.current_can('channels'))
);

drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels
for insert with check (
  private.current_role_name() <> 'client'
  and (select private.current_can('channels'))
  and created_by = auth.uid()
);

-- Renaming and archiving stay with the creator or an admin. Anyone may create.
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

-- Membership is now a personal bookmark: which channels are in my sidebar,
-- when did I last read them, am I muted. So you may only write your own row.
drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members
for select using ((select private.can_see_channel(channel_id)));

drop policy if exists channel_members_insert on public.channel_members;
create policy channel_members_insert on public.channel_members
for insert with check (
  profile_id = auth.uid() and (select private.can_see_channel(channel_id))
);

drop policy if exists channel_members_update on public.channel_members;
create policy channel_members_update on public.channel_members
for update using (profile_id = auth.uid());

drop policy if exists channel_members_delete on public.channel_members;
create policy channel_members_delete on public.channel_members
for delete using (
  profile_id = auth.uid() or (select private.current_is_admin())
);


-- ============================================================================
-- 4. Freelancers get chat
-- ============================================================================
-- The Freelancer role holds `staff-portal` and nothing else, which is what
-- makes it portal-only. That's DERIVED in permissions.ts, not stored — so
-- granting an ordinary page would silently promote them into the full CRM.
--
-- The fix is in the TypeScript: `channels` joins `settings` as a page that
-- doesn't count as "a real staff page" when deciding portal-only. Both are
-- things everyone needs and neither implies access to the app proper.
--
-- Grant it here; permissions.ts must ship the matching exemption or freelancers
-- land in the wrong place.

update public.roles
set pages = array_append(pages, 'channels')
where not ('channels' = any(pages));


-- ============================================================================
-- Verify
-- ============================================================================
--   select column_name from information_schema.columns
--    where table_name='channels';                    -- no 'kind'
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='private' and proname like '%channel%';   -- can_see_channel only
--   select name, pages from public.roles order by name;        -- all have 'channels'
