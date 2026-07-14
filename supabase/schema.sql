-- Trydent Labs CRM — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

-- ============ EXTENSIONS ============
create extension if not exists "pgcrypto";

-- ============ ENUM TYPES ============
create type user_role as enum ('admin', 'rep', 'client');
create type client_status as enum ('Lead', 'Prospect', 'Active Customer', 'Inactive Customer');
create type lead_source as enum ('Referral', 'Website', 'Social Media', 'Event');
create type deal_stage as enum ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost');
create type portal_status as enum ('Not Started', 'Building', 'Live: Shared with Client', 'Client Closed');

-- ============ PROFILES (extends Supabase auth.users) ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role user_role not null default 'rep',
  avatar_url text,
  -- if role = 'client', this links them to the one client record they can see
  client_id uuid,
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

-- ============ ACTIVITIES ============
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
  created_at timestamptz not null default now()
);

-- ============ CLIENT PORTALS ============
create table client_portals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status portal_status not null default 'Not Started',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index idx_clients_status on clients(status);
create index idx_clients_account_owner on clients(account_owner);
create index idx_deals_client_id on deals(client_id);
create index idx_deals_stage on deals(deal_stage);
create index idx_activities_client_id on activities(client_id);
create index idx_activities_deal_id on activities(deal_id);
create index idx_client_portals_client_id on client_portals(client_id);

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

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'rep')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ HELPER: current user's role ============
create or replace function current_role_name()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function current_client_id()
returns uuid as $$
  select client_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- ============ RLS ============
alter table profiles enable row level security;
alter table clients enable row level security;
alter table deals enable row level security;
alter table activities enable row level security;
alter table client_portals enable row level security;

-- Profiles: everyone can read all profiles (needed for assignee dropdowns), only admins can edit others
create policy "profiles_select_all" on profiles for select using (true);
create policy "profiles_update_self" on profiles for update using (id = auth.uid());
create policy "profiles_admin_all" on profiles for all using (current_role_name() = 'admin');

-- Clients: admins/reps full access, clients can only see their own record
create policy "clients_staff_all" on clients for all
  using (current_role_name() in ('admin', 'rep'));
create policy "clients_client_select_own" on clients for select
  using (current_role_name() = 'client' and id = current_client_id());

-- Deals: admins/reps full access, clients can view deals tied to their own client record
create policy "deals_staff_all" on deals for all
  using (current_role_name() in ('admin', 'rep'));
create policy "deals_client_select_own" on deals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Activities: admins/reps full access, clients can view activities tied to their own client record
create policy "activities_staff_all" on activities for all
  using (current_role_name() in ('admin', 'rep'));
create policy "activities_client_select_own" on activities for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Client portals: admins/reps full access, clients can view + read their own portal status
create policy "portals_staff_all" on client_portals for all
  using (current_role_name() in ('admin', 'rep'));
create policy "portals_client_select_own" on client_portals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- ============ SEED: nothing seeded — create your admin user via Supabase Auth, ============
-- ============ then run: update profiles set role = 'admin' where email = 'you@example.com'; ============
