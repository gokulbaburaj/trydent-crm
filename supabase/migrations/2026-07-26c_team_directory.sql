-- Trydent Labs CRM — Team directory for the client portal
-- Phase 4 of the portal roadmap: clients see WHO is working on their projects.
--
-- Two things happen here.
--
-- 1. A narrow view. Clients need staff names and avatars, and nothing else.
--    `profiles` carries email, team, and reporting lines, and RLS is row-level
--    so it can't hide columns. A view is the right tool: `team_directory`
--    exposes exactly four fields and never the email.
--
-- 2. A leak closed. `profiles_select_all` let ANY signed-in user read EVERY
--    profile row — including other clients' portal users and their emails.
--    That predates this phase. Staff keep full access; clients are now limited
--    to their own row.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create or replace view public.team_directory
with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_url, p.role
  from public.profiles p
  where p.role <> 'client';

grant select on public.team_directory to authenticated;

-- Tighten profiles: staff see everyone, everyone sees themselves.
drop policy if exists "profiles_select_all" on public.profiles;

drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles for select
  using (public.current_role_name() in ('admin', 'rep', 'contractor'));

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select
  using (id = auth.uid());
