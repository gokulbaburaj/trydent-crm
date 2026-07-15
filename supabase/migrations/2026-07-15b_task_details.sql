-- Trydent Labs CRM — Task details: description, deliverable links, subtasks
-- Run this whole file in the Supabase SQL editor (safe to re-run).

-- ============ TASK DETAILS ============
alter table public.project_tasks add column if not exists description text;
alter table public.project_tasks add column if not exists links jsonb not null default '[]'::jsonb;

-- ============ SUBTASKS ============
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  name text not null,
  status public.task_status not null default 'Not Started',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_items_task_id on public.task_items(task_id);

alter table public.task_items enable row level security;

drop policy if exists "task_items_staff_all" on public.task_items;
create policy "task_items_staff_all" on public.task_items for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "task_items_client_select_own" on public.task_items;
create policy "task_items_client_select_own" on public.task_items for select
  using (
    public.current_role_name() = 'client'
    and task_id in (
      select t.id
      from public.project_tasks t
      join public.projects p on p.id = t.project_id
      where p.client_id = public.current_client_id()
    )
  );
