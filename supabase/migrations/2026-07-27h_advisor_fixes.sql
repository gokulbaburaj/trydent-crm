-- Trydent Labs CRM — Supabase advisor remediation
--
-- Clears the two categories the linter is complaining about:
--
--   1. "Auth RLS Initialization Plan" (WARN, ~14 rows)
--   2. "Function Search Path Mutable" (WARN, however many are left)
--
-- The one CRITICAL row — "Security Definer View: public.team_directory" — is
-- NOT changed here. It is deliberate; see the note at the bottom of this file.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Auth RLS Initialization Plan
-- ============================================================================
--
-- `using (recipient_id = auth.uid())` re-runs auth.uid() for EVERY ROW the
-- planner tests. `using (recipient_id = (select auth.uid()))` makes Postgres
-- hoist it into an InitPlan: evaluated once per query, then compared as a
-- constant. Identical semantics — auth.uid() is stable within a statement —
-- and the gap widens linearly with table size.
--
-- Only policies that name auth.uid() directly are rewritten. Policies calling
-- public.current_role_name() aren't flagged, because that function is already
-- STABLE and the planner can cache it on its own.

-- ---- profiles ----
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using (id = (select auth.uid()));

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select
  using (id = (select auth.uid()));

-- ---- notifications ----
drop policy if exists "notifications_own_select" on public.notifications;
create policy "notifications_own_select" on public.notifications for select
  using (recipient_id = (select auth.uid()));

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update
  using (recipient_id = (select auth.uid()));

-- ---- staff_payments ----
drop policy if exists "staff_payments_own_select" on public.staff_payments;
create policy "staff_payments_own_select" on public.staff_payments for select
  using (profile_id = (select auth.uid()));

-- ---- project_tasks (contractor) ----
drop policy if exists "project_tasks_contractor_select_own" on public.project_tasks;
create policy "project_tasks_contractor_select_own" on public.project_tasks for select
  using (
    public.current_role_name() = 'contractor'
    and assigned_to = (select auth.uid())
  );

drop policy if exists "project_tasks_contractor_update_own" on public.project_tasks;
create policy "project_tasks_contractor_update_own" on public.project_tasks for update
  using (
    public.current_role_name() = 'contractor'
    and assigned_to = (select auth.uid())
  );

-- ---- activities (contractor) ----
drop policy if exists "activities_contractor_select_own" on public.activities;
create policy "activities_contractor_select_own" on public.activities for select
  using (
    public.current_role_name() = 'contractor'
    and assigned_to = (select auth.uid())
  );

-- Defensive re-drop. This policy let clients read EVERY activity row including
-- private meeting notes; permissive policies OR together, so leaving it beside
-- activities_client_select silently reopened the leak. Dropped in
-- 2026-07-27b — repeated here so a partial migration history can't resurrect it.
drop policy if exists "activities_client_select_own" on public.activities;

-- ---- task_comments ----
drop policy if exists "task_comments_client_insert" on public.task_comments;
create policy "task_comments_client_insert" on public.task_comments for insert
  with check (
    public.current_role_name() = 'client'
    and author_id = (select auth.uid())
    and task_id in (
      select t.id from public.project_tasks t
      join public.projects p on p.id = t.project_id
      where p.client_id = public.current_client_id()
    )
  );

-- ---- portal_messages ----
drop policy if exists "portal_messages_client_insert" on public.portal_messages;
create policy "portal_messages_client_insert" on public.portal_messages for insert
  with check (
    public.current_role_name() = 'client'
    and author_id = (select auth.uid())
    and client_id = public.current_client_id()
  );

-- ---- meeting_requests ----
drop policy if exists "meeting_requests_client_insert" on public.meeting_requests;
create policy "meeting_requests_client_insert" on public.meeting_requests for insert
  with check (
    public.current_role_name() = 'client'
    and requested_by = (select auth.uid())
    and client_id = public.current_client_id()
  );

-- ---- onboarding_tasks ----
drop policy if exists "onboarding_tasks_own_select" on public.onboarding_tasks;
create policy "onboarding_tasks_own_select" on public.onboarding_tasks for select
  using (profile_id = (select auth.uid()));

drop policy if exists "onboarding_tasks_own_update" on public.onboarding_tasks;
create policy "onboarding_tasks_own_update" on public.onboarding_tasks for update
  using (profile_id = (select auth.uid()));

-- ---- project_allocations ----
drop policy if exists "project_allocations_own_select" on public.project_allocations;
create policy "project_allocations_own_select" on public.project_allocations for select
  using (profile_id = (select auth.uid()));


-- ============================================================================
-- 2. Function Search Path Mutable
-- ============================================================================
--
-- A SECURITY DEFINER function without a pinned search_path runs whatever the
-- CALLER's search_path resolves `profiles` to. Anyone who can create a table in
-- a schema earlier on that path can shadow ours and have their version read
-- with the function owner's privileges. That's a privilege-escalation path.
--
-- 2026-07-27b pinned current_role_name() and current_client_id(). This catches
-- everything else — including any function added later — by iterating the
-- catalog rather than naming signatures, so it can't drift out of date.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      -- 'f' only: ALTER FUNCTION rejects procedures, and we have none.
      and p.prokind = 'f'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg like 'search_path=%'
      )
      -- Skip anything an extension owns. We don't own those functions, the
      -- ALTER would fail, and one failure aborts the whole block.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid
          and d.classid = 'pg_proc'::regclass
          and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.sig);
    raise notice 'pinned search_path on %', fn.sig;
  end loop;
end $$;


-- ============================================================================
-- 3. Security Definer View — public.team_directory — LEFT AS IS, ON PURPOSE
-- ============================================================================
--
-- The advisor marks this CRITICAL. It is a deliberate design decision, and
-- "fixing" it as the linter suggests would create a real leak. Reasoning, so
-- nobody silently reverses it later:
--
-- The client portal has to show which staff are on a client's projects — name
-- and avatar. RLS is ROW-level; it cannot hide the `email` column. So clients
-- must not be allowed to read `profiles` rows at all.
--
-- `team_directory` is the narrow window: four columns (id, full_name,
-- avatar_url, role), non-client rows only, email structurally absent. Because
-- it is security_invoker = false, it can read `profiles` past the RLS that
-- (correctly) blocks the client from doing so directly.
--
-- The linter's suggested fix is security_invoker = on. That would require a
-- policy on `profiles` letting clients select staff rows — and that policy
-- applies to direct `select * from profiles` too, handing every client every
-- staff email. Strictly worse.
--
-- Column-level grants can't rescue it either: the Team page and Onboarding page
-- both display profiles.email to staff, and `authenticated` is one Postgres
-- role covering staff and clients alike, so there is no column grant that
-- serves both.
--
-- The blast radius as written is four non-sensitive columns. That is the
-- correct trade. Recorded in the database itself so it survives this file:

comment on view public.team_directory is
  'Deliberate security-definer view. Clients need staff names and avatars but '
  'must never read public.profiles (RLS cannot hide the email column). Exposes '
  'exactly id, full_name, avatar_url, role for non-client profiles. Supabase '
  'advisor flags this as CRITICAL; see 2026-07-27h_advisor_fixes.sql for why '
  'security_invoker = on would be strictly less safe here.';
