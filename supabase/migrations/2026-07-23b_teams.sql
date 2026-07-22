-- Trydent Labs CRM — Real teams
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Teams used to be implicit (whatever text sat in profiles.team), so a team
-- only existed while someone was on it. This makes them real records you can
-- create, rename, and delete — including empty ones.
--
-- profiles.team stays the team NAME (not an FK) to avoid churning everything
-- that already reads it; renames are cascaded by the app in one update.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Backfill from whatever teams people are already assigned to.
insert into public.teams (name)
select distinct team
from public.profiles
where team is not null and btrim(team) <> ''
on conflict (name) do nothing;

alter table public.teams enable row level security;

-- Everyone signed in can read (the sidebar lists them); staff manage them.
drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams for select using (true);

drop policy if exists "teams_staff_write" on public.teams;
create policy "teams_staff_write" on public.teams for all
  using (public.current_role_name() in ('admin', 'rep'));
