-- Trydent Labs CRM — RLS batch 2 of 3: project tables
--
-- Same problem as batch 1: these still gate on employment type. A part-time
-- project manager granted the Projects page currently sees an empty board.
--
-- Note how this interacts with 2026-07-27m. Two ways in, deliberately:
--
--   *_page_all      you hold the Projects grant → you work across all projects
--   *_member_*      you're on this specific project → you see this one
--
-- Permissive policies OR together, so a Video Editor granted `projects` gets
-- the broad access, and someone on a project without the grant still gets that
-- project. Both are intended. If you want editors restricted to only their own
-- projects, take `projects` out of their role and rely on membership alone.
--
-- Run AFTER 2026-07-27k. 2026-07-27m is optional but pairs with it.
-- Safe to re-run.


-- ============================================================================
-- projects
-- ============================================================================

drop policy if exists "projects_staff_all" on public.projects;
create policy "projects_page_all" on public.projects for all
  using (public.current_can('projects'))
  with check (public.current_can('projects'));


-- ============================================================================
-- project_tasks
-- ============================================================================

drop policy if exists "project_tasks_staff_all" on public.project_tasks;
create policy "project_tasks_page_all" on public.project_tasks for all
  using (public.current_can('projects'))
  with check (public.current_can('projects'));


-- ============================================================================
-- task_items, task_comments
-- ============================================================================

drop policy if exists "task_items_staff_all" on public.task_items;
create policy "task_items_page_all" on public.task_items for all
  using (public.current_can('projects'))
  with check (public.current_can('projects'));

drop policy if exists "task_comments_staff_all" on public.task_comments;
create policy "task_comments_page_all" on public.task_comments for all
  using (public.current_can('projects'))
  with check (public.current_can('projects'));


-- ============================================================================
-- Verify before batch 3
-- ============================================================================
--
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('projects','project_tasks','task_items','task_comments')
--     and qual like '%full_time%';
--
-- Zero rows expected.
