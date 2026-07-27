-- Trydent Labs CRM — advisor remediation, applied live via the Supabase MCP
--
-- Recorded here so the repo matches the database. Everything in this file is
-- ALREADY APPLIED to project kpaiqnbnjgxtpaggyxht. Re-running is harmless.
--
-- Supabase's real linter surfaced two categories my hand-written
-- advisor-report.sql never checked, and chasing them turned up two live
-- production breaks that no linter would have found.
--
-- Security lints: 34 → 10, and the 10 that remain are explained at the bottom.


-- ============================================================================
-- 1. LIVE BREAK — stale enum literals in function bodies
-- ============================================================================
-- `alter type ... rename value` (2026-07-27n) updates the enum label and every
-- policy compiled against its OID. It does NOT rewrite plpgsql source. Two
-- functions still contained the literal 'rep', which no longer exists, so they
-- looked healthy in the catalog and threw at runtime:
--
--   handle_new_user  → EVERY new signup failed, staff and client portal alike
--   notify_staff     → every notification path failed: task comments, portal
--                      messages, meeting requests, client approvals
--
-- Neither the advisor nor a policy-level check can catch this. The only
-- reliable test is calling the function.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, full_name, email, role, client_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'full_time'),
    nullif(new.raw_user_meta_data->>'client_id', '')::uuid
  );
  return new;
end;
$fn$;

-- Who hears about client activity: admins, plus whoever handles client work
-- per their role's grants. Not "everyone full-time" — that's the
-- employment-type thinking removed everywhere else.
create or replace function public.notify_staff(p_type text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.notifications (recipient_id, type, body, link)
  select p.id, p_type, p_body, p_link
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.role <> 'client'
    and (
      p.role = 'admin'
      or coalesce(r.is_admin, false)
      or 'clients'  = any(coalesce(r.pages, '{}'::text[]))
      or 'projects' = any(coalesce(r.pages, '{}'::text[]))
    );
end;
$fn$;


-- ============================================================================
-- 2. VULNERABILITY — internal functions callable over the public API
-- ============================================================================
-- Postgres grants EXECUTE to PUBLIC on every new function, and PostgREST
-- exposes everything in `public` at /rest/v1/rpc/<name>. So all of these were
-- reachable from the open internet without signing in.
--
-- The one that mattered: notify_staff(text,text,text) has no auth check and
-- inserts a notification for every staff member. Anyone could POST arbitrary
-- body text and an arbitrary link and have it land in your team's notification
-- bell — a phishing channel pointed at your own staff.
--
-- Trigger functions never need EXECUTE granted: the trigger mechanism invokes
-- them regardless of the calling user's privileges.

revoke all on function public.notify_staff(text, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.on_task_comment() from public, anon, authenticated;
revoke all on function public.on_portal_message() from public, anon, authenticated;
revoke all on function public.on_meeting_request() from public, anon, authenticated;
revoke all on function public.seed_onboarding_tasks() from public, anon, authenticated;
revoke all on function public.enforce_single_default_template() from public, anon, authenticated;
revoke all on function public.touch_portal() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- approve_task is called by the client portal, so signed-in users keep it. It
-- already returns early for anyone without a client_id, so anon gained
-- nothing — no reason to leave the door open regardless.
revoke all on function public.approve_task(uuid) from public, anon;
grant execute on function public.approve_task(uuid) to authenticated;

revoke all on function public.current_role_name()          from public, anon;
revoke all on function public.current_client_id()          from public, anon;
revoke all on function public.current_pages()              from public, anon;
revoke all on function public.current_can(text)            from public, anon;
revoke all on function public.current_is_admin()           from public, anon;
revoke all on function public.is_project_member(uuid)      from public, anon;
revoke all on function public.has_task_in_project(uuid)    from public, anon;

grant execute on function public.current_role_name()       to authenticated;
grant execute on function public.current_client_id()       to authenticated;
grant execute on function public.current_pages()           to authenticated;
grant execute on function public.current_can(text)         to authenticated;
grant execute on function public.current_is_admin()        to authenticated;
grant execute on function public.is_project_member(uuid)   to authenticated;
grant execute on function public.has_task_in_project(uuid) to authenticated;


-- ============================================================================
-- 3. profiles readable by all staff, not just some employment types
-- ============================================================================
-- profiles_select_staff still listed ('admin','full_time','contract'), so a
-- part-timer or intern could read nobody but themselves — assignee pickers,
-- avatars and every "who owns this" label came back empty for them.

drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles for select
  using (public.current_role_name() <> 'client');


-- ============================================================================
-- 4. Drop the unreachable project-membership policies
-- ============================================================================
-- See 2026-07-27m. Each read `current_can('projects') AND is_project_member()`
-- while sitting beside `*_page_all`, which is just `current_can('projects')`.
-- Permissive policies OR, so the broader always won — these were unreachable
-- branches costing a function call per row tested. No access change.

drop policy if exists "projects_member_select"      on public.projects;
drop policy if exists "project_tasks_member_select" on public.project_tasks;
drop policy if exists "project_tasks_member_write"  on public.project_tasks;
drop policy if exists "project_tasks_member_insert" on public.project_tasks;
drop policy if exists "task_items_member_all"       on public.task_items;
drop policy if exists "task_comments_member_select" on public.task_comments;
drop policy if exists "task_comments_member_insert" on public.task_comments;


-- ============================================================================
-- What's deliberately left, and why
-- ============================================================================
--
-- security_definer_view — public.team_directory (ERROR)
--   Intentional. Clients need staff names and avatars; RLS is row-level and
--   cannot hide the email column, so clients must not read profiles at all.
--   The linter's fix (security_invoker = on) would require a policy letting
--   clients select staff rows, which applies to a direct `select * from
--   profiles` too — handing every client every staff email. Strictly worse.
--   Documented in a comment on the view itself.
--
-- authenticated_security_definer_function_executable × 8
--   current_can, current_pages, current_role_name, current_client_id,
--   current_is_admin, is_project_member, has_task_in_project, approve_task.
--
--   These CANNOT be revoked from `authenticated`. RLS policy expressions are
--   evaluated with the querying user's privileges, so revoking EXECUTE makes
--   every policy that calls them fail with "permission denied for function" —
--   an outage, not a hardening. And they leak nothing: each reports on the
--   caller's own session. current_can('accounts') tells you whether you can
--   open a page you could just as easily click.
--
-- auth_leaked_password_protection
--   Not fixable from SQL — it's project config. Turn it on at
--   Authentication → Providers → Email → "Prevent use of leaked passwords".
--   Checks new passwords against HaveIBeenPwned. Worth doing; you set the
--   initial passwords for portal users by hand.
