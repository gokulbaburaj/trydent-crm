-- Trydent Labs CRM — fix "infinite recursion detected in policy for relation projects"
--
-- What I got wrong
-- ----------------
-- 2026-07-27m added `projects_member_select`, whose USING clause contains:
--
--     exists (select 1 from public.project_tasks t
--             where t.project_id = projects.id and t.assigned_to = auth.uid())
--
-- That subquery runs under RLS. So Postgres evaluates the policies on
-- `project_tasks` — and one of those, `project_tasks_client_select_own` from
-- 2026-07-15, contains:
--
--     project_id in (select id from public.projects where client_id = ...)
--
-- projects → project_tasks → projects → forever. Postgres detects the cycle
-- and aborts the statement, which is why creating a project failed.
--
-- I used a SECURITY DEFINER helper for the same lookup on the *other* tables in
-- that migration precisely to avoid this, and then wrote the projects policy
-- inline because a policy on `projects` calling a function that reads
-- `projects` looked circular to me. It isn't: a definer function bypasses RLS
-- entirely, so there's no policy evaluation to recurse through. The inline
-- version was the dangerous one.
--
-- Run this on its own. Safe to re-run. It fixes the cause; you don't need to
-- keep the emergency `drop policy` if you already ran it.


-- ============================================================================
-- 1. Stop the bleeding
-- ============================================================================

drop policy if exists "projects_member_select" on public.projects;


-- ============================================================================
-- 2. Move the task lookup behind a definer function
-- ============================================================================
-- Reads project_tasks as the function owner, so no policy on that table is
-- consulted and there is nothing to recurse into.

create or replace function public.has_task_in_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_tasks t
    where t.project_id = p_project_id
      and t.assigned_to = auth.uid()
  );
$$;

grant execute on function public.has_task_in_project(uuid) to authenticated;


-- ============================================================================
-- 3. Recreate the policy without the recursive subquery
-- ============================================================================
-- member_ids and owner are columns on this row, so they cost nothing and
-- involve no other table. Only the task fallback needs the function.

create policy "projects_member_select" on public.projects for select
  using (
    public.current_can('projects')
    and (
      (select auth.uid()) = any(coalesce(member_ids, '{}'::uuid[]))
      or owner = (select auth.uid())
      or public.has_task_in_project(id)
    )
  );


-- ============================================================================
-- 4. Check
-- ============================================================================
--
-- Should return a row, not an error:
--
--   select count(*) from public.projects;
--
-- Then create a project from the Pipeline "Deal won" popup. If it saves, this
-- is done.
--
-- To catch this class of bug in future — any policy whose expression names a
-- table other than its own is a recursion risk:
--
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public'
--     and qual ~ 'FROM (public\.)?(projects|project_tasks)'
--     and tablename in ('projects', 'project_tasks');
