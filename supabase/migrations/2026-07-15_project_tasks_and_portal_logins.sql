-- Trydent Labs CRM — Project tasks + client portal logins
-- Run this whole file in the Supabase SQL editor.

-- ============ TASK STATUS ENUM ============
do $$ begin
  create type public.task_status as enum ('Not Started', 'In Progress', 'Done', 'Archived');
exception
  when duplicate_object then null;
end $$;

-- ============ PROJECT TASKS ============
create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status public.task_status not null default 'Not Started',
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_tasks_project_id on public.project_tasks(project_id);
create index if not exists idx_project_tasks_due_date on public.project_tasks(due_date);

drop trigger if exists project_tasks_set_updated_at on public.project_tasks;
create trigger project_tasks_set_updated_at before update on public.project_tasks
  for each row execute function public.set_updated_at();

alter table public.project_tasks enable row level security;

drop policy if exists "project_tasks_staff_all" on public.project_tasks;
create policy "project_tasks_staff_all" on public.project_tasks for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "project_tasks_client_select_own" on public.project_tasks;
create policy "project_tasks_client_select_own" on public.project_tasks for select
  using (
    public.current_role_name() = 'client'
    and project_id in (
      select id from public.projects where client_id = public.current_client_id()
    )
  );

-- ============ PROJECTS: make sure clients can read their own projects ============
alter table public.projects enable row level security;

drop policy if exists "projects_client_select_own" on public.projects;
create policy "projects_client_select_own" on public.projects for select
  using (public.current_role_name() = 'client' and client_id = public.current_client_id());

-- ============ PORTAL LOGIN USERNAME (stored for display; password is never stored) ============
alter table public.client_portals add column if not exists portal_username text;

-- ============ SIGNUP TRIGGER: carry role + client_id from user metadata ============
-- (schema-qualified + fixed search_path, matching the live fix already applied)
create or replace function public.handle_new_user()
returns trigger
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, client_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'rep'),
    nullif(new.raw_user_meta_data->>'client_id', '')::uuid
  );
  return new;
end;
$$ language plpgsql security definer;
