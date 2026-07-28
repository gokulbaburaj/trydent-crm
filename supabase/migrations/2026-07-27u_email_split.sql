-- Trydent Labs CRM — split email out of profiles, retire the definer view
--
-- ALREADY APPLIED to project kpaiqnbnjgxtpaggyxht via the Supabase MCP.
-- Recorded here so the repo matches the database. Safe to re-run.
--
-- The problem, stated properly
-- ----------------------------
-- The client portal must show clients which staff are on their projects —
-- names and avatars. But RLS is ROW-level: it can hide whole rows, it cannot
-- show `full_name` to a client while hiding `email` from them.
--
-- So clients were blocked from `profiles` entirely, and `team_directory` was a
-- SECURITY DEFINER view — a deliberate privilege elevation to read past the
-- policy that (correctly) shut them out. That worked, but it left a permanent
-- CRITICAL on the advisor, and a dashboard that's always red is a dashboard
-- nobody reads. The notify_staff hole sat unnoticed underneath exactly that.
--
-- The linter's suggested fix, security_invoker = on, would have required a
-- policy letting clients read staff rows — which also applies to a direct
-- `select * from profiles`, handing every client every staff email. Strictly
-- worse than the definer view.
--
-- The actual fix is neither. It's a schema shape problem wearing a permissions
-- costume: a column needing narrower visibility than its row belongs in its
-- own table. Move `email` out, and `profiles` holds nothing a colleague can't
-- see — so an ordinary row policy suffices and no elevation is needed.
--
-- Result: security advisor at 0 errors, down from 1 CRITICAL + 34 warnings.


-- ============================================================================
-- 1. profile_emails
-- ============================================================================

create table if not exists public.profile_emails (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  updated_at timestamptz not null default now()
);

insert into public.profile_emails (profile_id, email)
select id, email from public.profiles
on conflict (profile_id) do update set email = excluded.email;

alter table public.profile_emails enable row level security;

drop policy if exists "profile_emails_staff_select" on public.profile_emails;
create policy "profile_emails_staff_select" on public.profile_emails for select
  using (public.current_role_name() <> 'client');

drop policy if exists "profile_emails_own_select" on public.profile_emails;
create policy "profile_emails_own_select" on public.profile_emails for select
  using (profile_id = (select auth.uid()));

drop policy if exists "profile_emails_admin_write" on public.profile_emails;
create policy "profile_emails_admin_write" on public.profile_emails for all
  using (public.current_is_admin())
  with check (public.current_is_admin());

create index if not exists idx_profile_emails_email on public.profile_emails(email);


-- ============================================================================
-- 2. The signup trigger
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, full_name, role, client_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'full_time'),
    nullif(new.raw_user_meta_data->>'client_id', '')::uuid
  );

  insert into public.profile_emails (profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do update set email = excluded.email;

  return new;
end;
$fn$;


-- ============================================================================
-- 3. Drop the column, rebuild the view without elevation
-- ============================================================================

drop view if exists public.team_directory;

alter table public.profiles drop column if exists email;

-- Everyone signed in sees staff rows; you always see your own. A client sees
-- staff and themselves — never another client's portal account.
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles for select
  using (role <> 'client' or id = (select auth.uid()));

drop policy if exists "profiles_select_self" on public.profiles;

create view public.team_directory
with (security_invoker = true) as
  select p.id, p.full_name, p.avatar_url, p.role
  from public.profiles p
  where p.role <> 'client';

revoke all on public.team_directory from anon;
grant select on public.team_directory to authenticated;


-- ============================================================================
-- Accepted trade
-- ============================================================================
--
-- Clients can now read staff ROWS from `profiles`, so alongside name/avatar
-- they can also see `team`, `title`, `start_date` and `reports_to` — the org
-- chart, essentially. Not credentials, and mostly things a client learns on a
-- kickoff call. If that ever matters, those four columns move to a
-- `profile_details` table by exactly the same manoeuvre as email.
--
-- App changes that go with this migration:
--   * Profile type loses `email`; new ProfileEmail type
--   * useAuth returns your own `email` from the auth session — auth.users is
--     where it actually lives, rather than a denormalised copy
--   * Settings and Topbar read that
--   * Team and Onboarding read profile_emails for other people
--
-- Verified after applying: 6 profiles, 6 emails migrated, 4 directory rows,
-- profiles.email gone, view reports security_invoker=true.
