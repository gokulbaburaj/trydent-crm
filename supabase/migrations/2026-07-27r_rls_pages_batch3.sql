-- Trydent Labs CRM — RLS batch 3 of 3: schedule and shared tables
--
-- The last of the employment-type gating. After this, no policy in the
-- database decides access from whether someone is full-time or an intern.
--
-- Run AFTER 2026-07-27k. Safe to re-run.


-- ============================================================================
-- activities — the Schedule page
-- ============================================================================
-- The client and contractor policies stay as they are: a client sees meetings
-- explicitly marked client_visible, a person sees anything assigned to them.
-- This replaces only the blanket staff policy.

drop policy if exists "activities_staff_all" on public.activities;
create policy "activities_page_all" on public.activities for all
  using (public.current_can('schedule'))
  with check (public.current_can('schedule'));

-- Belt and braces. This is the policy that leaked every internal meeting note
-- to clients; it was dropped in 2026-07-27b and again in h. Third time, because
-- a resurrected copy of it would undo the whole of that fix silently.
drop policy if exists "activities_client_select_own" on public.activities;


-- ============================================================================
-- meeting_requests
-- ============================================================================

drop policy if exists "meeting_requests_staff_all" on public.meeting_requests;
create policy "meeting_requests_page_all" on public.meeting_requests for all
  using (public.current_can('schedule') or public.current_can('clients'))
  with check (public.current_can('schedule') or public.current_can('clients'));


-- ============================================================================
-- teams — everyone reads, Team page manages
-- ============================================================================
-- Team names appear in the sidebar and on people's profiles all over the app,
-- so the read stays open to any signed-in user. Only the write narrows.

drop policy if exists "teams_staff_write" on public.teams;
create policy "teams_page_write" on public.teams for all
  using (public.current_can('team'))
  with check (public.current_can('team'));


-- ============================================================================
-- app_settings — everyone reads, admins write
-- ============================================================================
-- This holds the base currency, which every money figure in the app formats
-- against, so the read has to stay open. Changing it re-denominates the whole
-- system, so the write goes to admins rather than a page grant.

drop policy if exists "app_settings_staff_write" on public.app_settings;
create policy "app_settings_admin_write" on public.app_settings for all
  using (public.current_is_admin())
  with check (public.current_is_admin());


-- ============================================================================
-- Final check — the whole database at once
-- ============================================================================
--
-- Nothing should decide access from employment type any more:
--
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public'
--     and (qual like '%full_time%' or with_check like '%full_time%');
--
-- Zero rows. Any that come back are tables I missed — send them over.
--
-- Then the real test. Give a role only {my-work, projects, settings}, assign
-- it to a test login, sign in as them and run:
--
--   select count(*) from public.projects;        -- expect > 0
--   select count(*) from public.clients;         -- expect 0
--   select count(*) from public.deals;           -- expect 0
--   select count(*) from public.staff_payments;  -- expect 0
--   select count(*) from public.applicants;      -- expect 0
--
-- Those five lines are the whole point of the exercise. Worth doing once
-- properly rather than trusting that it works.
