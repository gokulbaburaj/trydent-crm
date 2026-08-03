-- Trydent Labs CRM — one channel per team, created automatically
--
-- Apply after 2026-08-03b. Safe to re-run.
--
-- Why automatic
-- -------------
-- A team that has to be told to create its own channel doesn't get one. The
-- sidebar already lists Members and Projects under each team; Channels joins
-- them, and the link has to lead somewhere on the first click or nobody clicks
-- it twice.
--
-- One channel, not a list. With five teams and no messages yet, a "Channels"
-- node expanding into an empty list is a worse first impression than a link
-- that opens straight into the conversation.


-- ============================================================================
-- 1. Ownership
-- ============================================================================

alter table public.channels
  add column if not exists team_id uuid references public.teams(id) on delete cascade;

-- A team has at most one channel. Partial, so the many general channels that
-- belong to no team are unaffected.
create unique index if not exists channels_team_key
  on public.channels (team_id) where team_id is not null;


-- ============================================================================
-- 2. Naming
-- ============================================================================
-- "Video Editing" -> "video-editing". Kept as a function because the trigger
-- and the backfill must agree, and because a renamed team has to be able to
-- reproduce the same slug.

create or replace function private.channel_slug(p_name text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
           regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
$$;


-- ============================================================================
-- 3. The trigger
-- ============================================================================
-- SECURITY DEFINER because `channels_insert` requires `created_by = auth.uid()`
-- and demands the caller hold the channels grant. Neither is true of a trigger
-- firing inside someone else's INSERT on `teams` — and creating a team is
-- already an admin action, so the check has been made one level up.
--
-- ON CONFLICT DO NOTHING covers the case where a channel of that name already
-- exists: better a team quietly shares an existing channel than team creation
-- fails with a unique-violation on a table the admin wasn't thinking about.

create or replace function private.create_team_channel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  slug text := private.channel_slug(new.name);
begin
  if slug = '' then
    return new;
  end if;

  insert into public.channels (name, topic, team_id, created_by)
  values (slug, new.name || ' team', new.id, auth.uid())
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists teams_create_channel on public.teams;
create trigger teams_create_channel
after insert on public.teams
for each row execute function private.create_team_channel();


-- ============================================================================
-- 4. Backfill
-- ============================================================================
-- Every team that exists today. `created_by` is left null: nobody actually
-- created these, and attributing them to whoever ran the migration would be a
-- small lie that shows up in the UI.

-- (a) Adopt first.
--
-- A channel may already exist under the team's name — it did for Management,
-- created by hand minutes before this ran. The first version of this migration
-- only skipped those, which left the team with no channel at all despite the
-- comment above claiming it would share one. Claiming and doing are different.
update public.channels c
set team_id = t.id,
    topic   = coalesce(c.topic, t.name || ' team')
from public.teams t
where c.team_id is null
  and lower(c.name) = private.channel_slug(t.name)
  and not exists (select 1 from public.channels x where x.team_id = t.id);

-- (b) Then create for the teams still without one.
insert into public.channels (name, topic, team_id, created_by)
select private.channel_slug(t.name), t.name || ' team', t.id, null
from public.teams t
where private.channel_slug(t.name) <> ''
  and not exists (select 1 from public.channels c where c.team_id = t.id)
  and not exists (
    select 1 from public.channels c where lower(c.name) = private.channel_slug(t.name)
  );


-- ============================================================================
-- Verify
-- ============================================================================
--   select t.name, c.name as channel
--     from public.teams t left join public.channels c on c.team_id = t.id
--    order by t.name;                    -- every team has one
