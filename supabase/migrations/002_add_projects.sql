-- Trydent Labs CRM — Migration 002: Projects module
-- Run this in the Supabase SQL editor. Safe to run once on top of the
-- original supabase/schema.sql.

-- ============ ENUM TYPE ============
create type project_status as enum ('Planning', 'In Progress', 'Review', 'Delivered', 'On Hold');

-- ============ PROJECTS ============
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid not null references clients(id) on delete cascade,
  status project_status not null default 'Planning',
  owner uuid references profiles(id) on delete set null,
  start_date date,
  due_date date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_projects_client_id on projects(client_id);
create index idx_projects_status on projects(status);
create index idx_projects_owner on projects(owner);

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

create policy "projects_staff_all" on projects for all
  using (current_role_name() in ('admin', 'rep'));
create policy "projects_client_select_own" on projects for select
  using (current_role_name() = 'client' and client_id = current_client_id());
