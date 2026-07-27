-- Trydent Labs CRM — project membership as a first-class access rule
--
-- The gap this closes
-- -------------------
-- 2026-07-27k can grant someone the Projects page. But `projects` has only
-- ever had two policies — staff (admin/rep) and client-owns-it. A contractor
-- matches neither, so the page they were just granted renders empty. Granting
-- a page has to mean the data behind it arrives, or the setting is theatre.
--
-- This makes "is on the project" a real rule across the four tables a project
-- is actually made of, so there's no half-open state where you can see a task
-- but not its subtasks.
--
-- Who counts as on the project, in the order it gets set:
--   * listed in projects.member_ids  (the Team picker on the project page)
--   * owns it                        (projects.owner)
--   * has a task in it               (assigned_to on any of its tasks)
--
-- The third is the safety net — nobody has to remember to add someone to the
-- team before assigning them work.
--
-- What this does NOT open. Membership gets you the work: the project, its
-- tasks, subtasks and comments. It does not get you the client record, the
-- deal, the budget, the invoices or anyone's pay. Those stay behind their own
-- page grants.
--
-- Run AFTER 2026-07-27k. Safe to re-run.


-- ============================================================================
-- 1. One membership test, used everywhere
-- ============================================================================
-- Written once as a function rather than copied into six policies: a rule
-- duplicated six times is a rule that will disagree with itself the first time
-- someone edits five of them.
--
-- SECURITY DEFINER so it reads `projects` directly instead of re-entering that
-- table's RLS from inside another table's policy. search_path pinned, as with
-- every definer function here.

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        auth.uid() = any(coalesce(p.member_ids, '{}'::uuid[]))
        or p.owner = auth.uid()
        or exists (
          select 1 from public.project_tasks t
          where t.project_id = p.id and t.assigned_to = auth.uid()
        )
      )
  );
$$;

grant execute on function public.is_project_member(uuid) to authenticated;


-- ============================================================================
-- 2. Projects — read the ones you're on
-- ============================================================================
-- Read-only. Being on a project lets you open it, not rename it or change its
-- budget. Expressed inline rather than via the helper because a policy on
-- `projects` that queried `projects` would be circular.

drop policy if exists "projects_member_select" on public.projects;
create policy "projects_member_select" on public.projects for select
  using (
    public.current_can('projects')
    and (
      (select auth.uid()) = any(coalesce(member_ids, '{}'::uuid[]))
      or owner = (select auth.uid())
      or exists (
        select 1 from public.project_tasks t
        where t.project_id = projects.id
          and t.assigned_to = (select auth.uid())
      )
    )
  );


-- ============================================================================
-- 3. Tasks — the whole board, not just your own card
-- ============================================================================
-- The existing contractor policy showed only tasks assigned to them, which
-- makes a kanban board that's mostly empty and hides what the rest of the team
-- is doing. On the team means you see the team's work.
--
-- The older own-tasks policies stay in place: someone can be assigned a task on
-- a project they were never formally added to, and they should still see it.

drop policy if exists "project_tasks_member_select" on public.project_tasks;
create policy "project_tasks_member_select" on public.project_tasks for select
  using (
    public.current_can('projects')
    and public.is_project_member(project_id)
  );

-- Move a card without needing an admin. Insert too, so a two-person project
-- isn't blocked on someone else creating the work.
drop policy if exists "project_tasks_member_write" on public.project_tasks;
create policy "project_tasks_member_write" on public.project_tasks for update
  using (public.current_can('projects') and public.is_project_member(project_id))
  with check (public.current_can('projects') and public.is_project_member(project_id));

drop policy if exists "project_tasks_member_insert" on public.project_tasks;
create policy "project_tasks_member_insert" on public.project_tasks for insert
  with check (public.current_can('projects') and public.is_project_member(project_id));


-- ============================================================================
-- 4. Subtasks
-- ============================================================================
-- Without this a member opens a task and sees an empty subtask board with no
-- explanation — the exact half-open state worth avoiding.

drop policy if exists "task_items_member_all" on public.task_items;
create policy "task_items_member_all" on public.task_items for all
  using (
    public.current_can('projects')
    and exists (
      select 1 from public.project_tasks t
      where t.id = task_items.task_id
        and public.is_project_member(t.project_id)
    )
  )
  with check (
    public.current_can('projects')
    and exists (
      select 1 from public.project_tasks t
      where t.id = task_items.task_id
        and public.is_project_member(t.project_id)
    )
  );


-- ============================================================================
-- 5. Comments
-- ============================================================================
-- Read the thread, and add to it as yourself. No update or delete policy, so
-- nobody can rewrite or remove someone else's comment — including their own,
-- deliberately: a discussion others have replied to shouldn't develop holes.

drop policy if exists "task_comments_member_select" on public.task_comments;
create policy "task_comments_member_select" on public.task_comments for select
  using (
    public.current_can('projects')
    and exists (
      select 1 from public.project_tasks t
      where t.id = task_comments.task_id
        and public.is_project_member(t.project_id)
    )
  );

drop policy if exists "task_comments_member_insert" on public.task_comments;
create policy "task_comments_member_insert" on public.task_comments for insert
  with check (
    public.current_can('projects')
    and author_id = (select auth.uid())
    and exists (
      select 1 from public.project_tasks t
      where t.id = task_comments.task_id
        and public.is_project_member(t.project_id)
    )
  );


-- ============================================================================
-- 6. Indexes the new policies lean on
-- ============================================================================
-- member_ids is a uuid[] tested with `= any(...)` on every candidate row, and
-- the task fallback filters on assigned_to. Without these, every project query
-- from a member scans the table.

create index if not exists idx_projects_member_ids on public.projects using gin (member_ids);
create index if not exists idx_project_tasks_assigned_to on public.project_tasks(assigned_to);
create index if not exists idx_task_items_task_id on public.task_items(task_id);
create index if not exists idx_task_comments_task_id on public.task_comments(task_id);


-- ============================================================================
-- Verify — sign in as a contractor and run these
-- ============================================================================
--
--   select count(*) from public.projects;       -- only the ones they're on
--   select count(*) from public.project_tasks;  -- only those projects' tasks
--   select count(*) from public.clients;        -- expect 0
--   select count(*) from public.deals;          -- expect 0
--   select count(*) from public.staff_payments; -- expect 1 (their own) or 0
--
-- The last three are the point. If any returns more than expected, tell me
-- which before giving anyone the login.
