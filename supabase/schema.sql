-- Trydent Labs CRM — Supabase schema (CONSOLIDATED — current as of 2026-07-16)
-- Run this on a FRESH project only. Existing databases should already have
-- everything here via supabase/migrations/*, which remain for history.

-- ============ EXTENSIONS ============
create extension if not exists "pgcrypto";

-- ============ ENUM TYPES ============
create type user_role as enum ('admin', 'rep', 'client', 'contractor');
create type client_status as enum ('Lead', 'Prospect', 'Active Customer', 'Inactive Customer');
create type lead_source as enum ('Referral', 'Website', 'Social Media', 'Event');
-- 'Negotiation' is legacy: merged into 'Proposal' (migration 2026-07-22d).
-- Kept in the type because Postgres can't drop an enum value already in use.
create type deal_stage as enum ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost');
create type portal_status as enum ('Not Started', 'Building', 'Live: Shared with Client', 'Client Closed');
create type project_status as enum ('Planning', 'In Progress', 'Review', 'Delivered', 'On Hold');
create type task_status as enum ('Not Started', 'In Progress', 'Done', 'Archived');
create type task_priority as enum ('urgent', 'high', 'normal', 'low');
create type recurrence as enum ('none', 'daily', 'weekly', 'biweekly', 'monthly');

-- ============ PROFILES (extends Supabase auth.users) ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role user_role not null default 'rep',
  avatar_url text,
  -- if role = 'client', this links them to the one client record they can see
  client_id uuid,
  team text,                                    -- team/department name (staff)
  reports_to uuid references profiles(id) on delete set null, -- manager
  created_at timestamptz not null default now()
);

-- ============ CLIENTS ============
create table clients (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  point_person text,
  email text,
  phone text,
  address text,
  status client_status not null default 'Lead',
  lead_source lead_source,
  tags text[] not null default '{}',
  account_owner uuid references profiles(id) on delete set null,
  last_contact date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add constraint profiles_client_id_fkey
  foreign key (client_id) references clients(id) on delete set null;

-- ============ DEALS ============
create table deals (
  id uuid primary key default gen_random_uuid(),
  deal_name text not null,
  client_id uuid not null references clients(id) on delete cascade,
  deal_stage deal_stage not null default 'Lead',
  deal_value numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  close_date date,
  account_owner uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ ACTIVITIES (branded "Schedule" in the UI) ============
create table activities (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  outcome text,
  location text,
  follow_up_required boolean not null default false,
  client_id uuid references clients(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete set null,
  activity_date timestamptz not null default now(),
  color text, -- custom calendar chip color (right-click in month view)
  recurrence recurrence not null default 'none',
  recurrence_parent_id uuid references activities(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ CLIENT PORTALS ============
create table client_portals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status portal_status not null default 'Not Started',
  notes text,
  portal_username text,        -- login username shown to admins (password never stored)
  last_opened_at timestamptz,  -- set via touch_portal() when the client opens their portal
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- ============ PROJECT TASKS ============
create table project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  status task_status not null default 'Not Started',
  due_date date,
  assigned_to uuid references profiles(id) on delete set null,
  sort_order int not null default 0,
  description text,
  links jsonb not null default '[]'::jsonb, -- [{title, url}] deliverable links
  label text,                                -- free-text label chip (e.g. "UI design")
  priority task_priority not null default 'normal',
  recurrence recurrence not null default 'none',
  recurrence_parent_id uuid references project_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ STAFF PAYMENT PLANS (contractor portal) ============
create table staff_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  status text not null default 'pending', -- 'pending' | 'paid'
  due_date date,
  created_at timestamptz not null default now()
);

-- ============ SUBTASKS ============
create table task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references project_tasks(id) on delete cascade,
  name text not null,
  status task_status not null default 'Not Started',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index idx_clients_status on clients(status);
create index idx_clients_account_owner on clients(account_owner);
create index idx_deals_client_id on deals(client_id);
create index idx_deals_stage on deals(deal_stage);
create index idx_activities_client_id on activities(client_id);
create index idx_activities_deal_id on activities(deal_id);
create index idx_client_portals_client_id on client_portals(client_id);
create index idx_projects_client_id on projects(client_id);
create index idx_projects_status on projects(status);
create index idx_projects_owner on projects(owner);
create index idx_project_tasks_project_id on project_tasks(project_id);
create index idx_project_tasks_due_date on project_tasks(due_date);
create index idx_project_tasks_recurrence_parent on project_tasks(recurrence_parent_id);
create index idx_activities_recurrence_parent on activities(recurrence_parent_id);
create index idx_profiles_reports_to on profiles(reports_to);
create index idx_task_items_task_id on task_items(task_id);

-- ============ updated_at TRIGGER ============
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at before update on clients
  for each row execute function set_updated_at();
create trigger deals_set_updated_at before update on deals
  for each row execute function set_updated_at();
create trigger client_portals_set_updated_at before update on client_portals
  for each row execute function set_updated_at();
create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger project_tasks_set_updated_at before update on project_tasks
  for each row execute function set_updated_at();

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
-- Schema-qualified with a fixed search_path (Supabase runs auth triggers with a
-- restricted search path). Carries role + client_id from user metadata so the
-- portal-login API can provision client accounts.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ HELPERS ============
create or replace function current_role_name()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_client_id()
returns uuid as $$
  select client_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Clients can't update portal rows (RLS), so this security-definer function
-- only touches the timestamp on their own portal when they open it.
create or replace function public.touch_portal()
returns void
set search_path = public
as $$
begin
  update public.client_portals
  set last_opened_at = now()
  where client_id = public.current_client_id();
end;
$$ language plpgsql security definer;

grant execute on function public.touch_portal() to authenticated;

-- ============ RLS ============
alter table profiles enable row level security;
alter table clients enable row level security;
alter table deals enable row level security;
alter table activities enable row level security;
alter table client_portals enable row level security;
alter table projects enable row level security;
alter table project_tasks enable row level security;
alter table task_items enable row level security;
alter table staff_payments enable row level security;

-- Profiles: everyone can read all profiles (needed for assignee dropdowns), only admins can edit others
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (id = auth.uid());
create policy "profiles_admin_all" on profiles for all using (current_role_name() = 'admin');

-- Clients: admins/reps full access, clients can only see their own record
create policy "clients_staff_all" on clients for all
  using (current_role_name() in ('admin', 'rep'));
create policy "clients_client_select_own" on clients for select
  using (current_role_name() = 'client' and id = current_client_id());

-- Deals
create policy "deals_staff_all" on deals for all
  using (current_role_name() in ('admin', 'rep'));
create policy "deals_client_select_own" on deals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Activities
create policy "activities_staff_all" on activities for all
  using (current_role_name() in ('admin', 'rep'));
create policy "activities_client_select_own" on activities for select
  using (current_role_name() = 'client' and client_id = current_client_id());
create policy "activities_contractor_select_own" on activities for select
  using (current_role_name() = 'contractor' and assigned_to = auth.uid());

-- Client portals
create policy "portals_staff_all" on client_portals for all
  using (current_role_name() in ('admin', 'rep'));
create policy "portals_client_select_own" on client_portals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Projects
create policy "projects_staff_all" on projects for all
  using (current_role_name() in ('admin', 'rep'));
create policy "projects_client_select_own" on projects for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Project tasks
create policy "project_tasks_staff_all" on project_tasks for all
  using (current_role_name() in ('admin', 'rep'));
create policy "project_tasks_client_select_own" on project_tasks for select
  using (
    current_role_name() = 'client'
    and project_id in (select id from projects where client_id = current_client_id())
  );
create policy "project_tasks_contractor_select_own" on project_tasks for select
  using (current_role_name() = 'contractor' and assigned_to = auth.uid());
create policy "project_tasks_contractor_update_own" on project_tasks for update
  using (current_role_name() = 'contractor' and assigned_to = auth.uid());

-- Staff payment plans: staff manage all; a person reads their own
create policy "staff_payments_staff_all" on staff_payments for all
  using (current_role_name() in ('admin', 'rep'));
create policy "staff_payments_own_select" on staff_payments for select
  using (profile_id = auth.uid());

-- Subtasks
create policy "task_items_staff_all" on task_items for all
  using (current_role_name() in ('admin', 'rep'));
create policy "task_items_client_select_own" on task_items for select
  using (
    current_role_name() = 'client'
    and task_id in (
      select t.id from project_tasks t
      join projects p on p.id = t.project_id
      where p.client_id = current_client_id()
    )
  );

-- ============ SETUP ============
-- 1. Create your admin user via Supabase Auth, then:
--    update profiles set role = 'admin' where email = 'you@example.com';
-- 2. Client portal logins are created from the app (Portals tab) and require
--    SUPABASE_SERVICE_ROLE_KEY in the server environment.
