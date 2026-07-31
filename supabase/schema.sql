-- Trydent Labs CRM — full schema snapshot.
--
-- Generated from the live database on 2026-07-31 by running
-- supabase/dump-schema.sql. This file had drifted about fifteen tables behind
-- production, because every change since launch went in as a migration and
-- nobody replayed them into the snapshot. Treat it as a read-only mirror:
--   - to CHANGE the database, add a file under supabase/migrations/
--   - to REFRESH this file, re-run dump-schema.sql and paste the output
--
-- Running it top to bottom on an empty database reproduces production, minus
-- data and minus the auth schema (Supabase owns that).
--
-- A note on the access model, because it isn't obvious from the policies:
-- `current_can(page)` is the hinge. A role carries a `pages` text[], and a
-- policy that reads `current_can('clients')` is asking "has an admin ticked
-- Clients for this person's role". Admins short-circuit to true, clients to
-- false. So the checkbox grid in Settings is not decoration — ticking a box
-- hands over the rows, not just the menu item.

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Enums
-- ═══════════════════════════════════════════════════════════════════════

-- 'Negotiation' is dead — merged into 'Proposal' in migration 2026-07-22d.
-- The label survives because dropping an enum value requires rewriting the
-- type, and no code produces it any more.
create type public.deal_stage as enum
  ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost');

-- Account type, not job title. What someone can *reach* comes from their
-- role's page grants; this says how they relate to the company. 'admin' and
-- 'client' are genuine account kinds, the rest are employment terms.
-- Note the order: 'full_time' sits second because it was renamed in place
-- from the original 'rep' (ALTER TYPE ... RENAME VALUE), which is also why
-- two plpgsql functions kept a stale 'rep' literal for a week and silently
-- broke every signup.
create type public.user_role as enum
  ('admin', 'full_time', 'client', 'contract', 'part_time', 'intern');

create type public.client_status as enum
  ('Lead', 'Prospect', 'Active Customer', 'Inactive Customer');
create type public.lead_source as enum
  ('Referral', 'Website', 'Social Media', 'Event');
create type public.portal_status as enum
  ('Not Started', 'Building', 'Live: Shared with Client', 'Client Closed');
create type public.project_status as enum
  ('Planning', 'In Progress', 'Review', 'Delivered', 'On Hold');
create type public.recurrence as enum
  ('none', 'daily', 'weekly', 'biweekly', 'monthly');
create type public.task_priority as enum ('urgent', 'high', 'normal', 'low');
create type public.task_status as enum
  ('Not Started', 'In Progress', 'Done', 'Archived');

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Tables
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id uuid not null,
  full_name text not null,
  role user_role not null default 'full_time'::user_role,
  avatar_url text,
  client_id uuid,
  created_at timestamp with time zone not null default now(),
  team text,
  reports_to uuid,
  title text,
  start_date date,
  role_id uuid
);
-- No `email` column, deliberately. Clients can read staff rows (they need to
-- see who's assigned to their work), and RLS is row-level — it cannot hide one
-- column from one role. A column needing narrower visibility than its row
-- belongs in its own table, hence profile_emails below.

create table if not exists public.profile_emails (
  profile_id uuid not null,
  email text not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.teams (
  id uuid not null default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone not null default now()
);
-- `teams` arrived after `profiles.team` and `roles.team` were already text, so
-- a team name lives in three places with no foreign key tying them together.
-- Renames and deletes must fan out to all three by hand — see lib/useOrgAdmin.

create table if not exists public.roles (
  id uuid not null default gen_random_uuid(),
  name text not null,
  team text,
  template_id uuid,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  pages text[] not null default '{}'::text[],
  is_admin boolean not null default false
);
-- `pages` is the access model. Mirrors PageKey in lib/permissions.ts and is
-- read by current_can() in every policy below. An empty array means the person
-- signs in to an app with no sidebar, which is why new roles are seeded with a
-- baseline rather than nothing.

create table if not exists public.clients (
  id uuid not null default gen_random_uuid(),
  company text not null,
  point_person text,
  email text,
  phone text,
  address text,
  status client_status not null default 'Lead'::client_status,
  lead_source lead_source,
  tags text[] not null default '{}'::text[],
  account_owner uuid,
  last_contact date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.deals (
  id uuid not null default gen_random_uuid(),
  deal_name text not null,
  client_id uuid not null,
  deal_stage deal_stage not null default 'Lead'::deal_stage,
  deal_value numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  close_date date,
  account_owner uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  currency text not null default 'USD'::text
);

create table if not exists public.projects (
  id uuid not null default gen_random_uuid(),
  name text not null,
  client_id uuid not null,
  status project_status not null default 'Planning'::project_status,
  owner uuid,
  start_date date,
  due_date date,
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  member_ids uuid[] not null default '{}'::uuid[],
  budget numeric not null default 0,
  currency text not null default 'USD'::text,
  deal_id uuid,
  archived boolean not null default false
);

create table if not exists public.project_tasks (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  name text not null,
  status task_status not null default 'Not Started'::task_status,
  due_date date,
  assigned_to uuid,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  label text,
  description text,
  links jsonb not null default '[]'::jsonb,
  approved_at timestamp with time zone,
  approved_by uuid,
  priority task_priority not null default 'normal'::task_priority,
  recurrence recurrence not null default 'none'::recurrence,
  recurrence_parent_id uuid
);

create table if not exists public.task_items (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  name text not null,
  status task_status not null default 'Not Started'::task_status,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.task_comments (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.project_allocations (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  profile_id uuid not null,
  amount numeric not null default 0,
  role_label text,
  note text,
  paid boolean not null default false,
  created_at timestamp with time zone not null default now(),
  percent numeric
);

create table if not exists public.staff_payments (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  label text not null,
  amount numeric not null default 0,
  status text not null default 'pending'::text,
  due_date date,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.activities (
  id uuid not null default gen_random_uuid(),
  description text not null,
  outcome text,
  location text,
  follow_up_required boolean not null default false,
  client_id uuid,
  deal_id uuid,
  assigned_to uuid,
  activity_date timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  color text,
  recurrence recurrence not null default 'none'::recurrence,
  recurrence_parent_id uuid,
  agenda text,
  notes text,
  attendee_ids uuid[] not null default '{}'::uuid[],
  client_visible boolean not null default false
);
-- client_visible defaults to false on purpose: an internal note should never
-- reach a client by omission.

create table if not exists public.meeting_requests (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  requested_by uuid,
  topic text not null,
  preferred_date date,
  note text,
  status text not null default 'pending'::text,
  activity_id uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.client_portals (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  status portal_status not null default 'Not Started'::portal_status,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  portal_username text,
  last_opened_at timestamp with time zone
);
-- No password column, and that is not an oversight. Portal credentials live in
-- auth.users, hashed. The admin UI offers reset-to-reveal instead of showing an
-- existing password, because we genuinely cannot show one.

create table if not exists public.portal_updates (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.portal_messages (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.client_documents (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  project_id uuid,
  name text not null,
  category text not null default 'other'::text,
  url text,
  storage_path text,
  added_by uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.invoices (
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  deal_id uuid,
  number text not null,
  amount numeric not null default 0,
  currency text not null default 'USD'::text,
  status text not null default 'draft'::text,
  issue_date date,
  due_date date,
  document_url text,
  storage_path text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.goals (
  id uuid not null default gen_random_uuid(),
  objective text not null,
  description text,
  owner uuid,
  period text not null default ''::text,
  status text not null default 'on_track'::text,
  start_date date,
  end_date date,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.key_results (
  id uuid not null default gen_random_uuid(),
  goal_id uuid not null,
  name text not null,
  source text not null default 'manual'::text,
  target numeric not null default 0,
  current_manual numeric not null default 0,
  unit text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.applicants (
  id uuid not null default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  location text,
  stage text not null default 'applied'::text,
  source text,
  resume_url text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  role_id uuid,
  shortlisted boolean not null default false
);
-- `stage` tracks the process, `shortlisted` tracks your opinion. They differ:
-- you can rate someone highly at Applied and go cold at Interview.

create table if not exists public.onboarding_templates (
  id uuid not null default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  welcome_note text
);

create table if not exists public.onboarding_template_items (
  id uuid not null default gen_random_uuid(),
  template_id uuid not null,
  title text not null,
  sort_order integer not null default 0,
  section text not null default 'Before first day'::text
);

create table if not exists public.onboarding_tasks (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  title text not null,
  done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  section text not null default 'Before first day'::text
);

create table if not exists public.notifications (
  id uuid not null default gen_random_uuid(),
  recipient_id uuid not null,
  type text not null,
  body text not null,
  link text,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.app_settings (
  id boolean not null default true,
  base_currency text not null default 'USD'::text,
  updated_at timestamp with time zone not null default now()
);
-- Single-row table. The `id boolean check (id)` trick makes a second row
-- impossible without a trigger.

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Keys, uniques and checks
-- ═══════════════════════════════════════════════════════════════════════

alter table public.activities add constraint activities_pkey primary key (id);
alter table public.app_settings add constraint app_settings_pkey primary key (id);
alter table public.applicants add constraint applicants_pkey primary key (id);
alter table public.client_documents add constraint client_documents_pkey primary key (id);
alter table public.client_portals add constraint client_portals_pkey primary key (id);
alter table public.clients add constraint clients_pkey primary key (id);
alter table public.deals add constraint deals_pkey primary key (id);
alter table public.goals add constraint goals_pkey primary key (id);
alter table public.invoices add constraint invoices_pkey primary key (id);
alter table public.key_results add constraint key_results_pkey primary key (id);
alter table public.meeting_requests add constraint meeting_requests_pkey primary key (id);
alter table public.notifications add constraint notifications_pkey primary key (id);
alter table public.onboarding_tasks add constraint onboarding_tasks_pkey primary key (id);
alter table public.onboarding_template_items add constraint onboarding_template_items_pkey primary key (id);
alter table public.onboarding_templates add constraint onboarding_templates_pkey primary key (id);
alter table public.portal_messages add constraint portal_messages_pkey primary key (id);
alter table public.portal_updates add constraint portal_updates_pkey primary key (id);
alter table public.profile_emails add constraint profile_emails_pkey primary key (profile_id);
alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.project_allocations add constraint project_allocations_pkey primary key (id);
alter table public.project_tasks add constraint project_tasks_pkey primary key (id);
alter table public.projects add constraint projects_pkey primary key (id);
alter table public.roles add constraint roles_pkey primary key (id);
alter table public.staff_payments add constraint staff_payments_pkey primary key (id);
alter table public.task_comments add constraint task_comments_pkey primary key (id);
alter table public.task_items add constraint task_items_pkey primary key (id);
alter table public.teams add constraint teams_pkey primary key (id);

alter table public.project_allocations
  add constraint project_allocations_project_id_profile_id_key unique (project_id, profile_id);
alter table public.roles add constraint roles_name_key unique (name);
alter table public.teams add constraint teams_name_key unique (name);

alter table public.app_settings add constraint app_settings_id_check check (id);
alter table public.applicants add constraint applicants_stage_valid
  check (stage = any (array['applied','screening','interview','offer','hired','rejected']::text[]));
-- A document has to be somewhere: either a link we were given or a file we
-- hold. Neither means a row that renders as an un-openable name.
alter table public.client_documents add constraint client_documents_has_location
  check (url is not null or storage_path is not null);
alter table public.goals add constraint goals_status_valid
  check (status = any (array['on_track','at_risk','off_track','achieved']::text[]));
alter table public.invoices add constraint invoices_status_valid
  check (status = any (array['draft','sent','paid']::text[]));
alter table public.key_results add constraint key_results_source_valid
  check (source = any (array['manual','revenue_won','deals_closed','new_clients','tasks_done','invoices_paid']::text[]));
alter table public.meeting_requests add constraint meeting_requests_status_valid
  check (status = any (array['pending','scheduled','declined']::text[]));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Foreign keys
-- ═══════════════════════════════════════════════════════════════════════
-- CASCADE where the child is meaningless without the parent (a task without a
-- project). SET NULL where the reference is a convenience (an unassigned task
-- is still a task, so deleting a person must not delete their work).

alter table public.activities add constraint activities_assigned_to_fkey foreign key (assigned_to) references profiles(id) on delete set null;
alter table public.activities add constraint activities_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.activities add constraint activities_deal_id_fkey foreign key (deal_id) references deals(id) on delete cascade;
alter table public.activities add constraint activities_recurrence_parent_id_fkey foreign key (recurrence_parent_id) references activities(id) on delete set null;
alter table public.applicants add constraint applicants_role_id_fkey foreign key (role_id) references roles(id) on delete set null;
alter table public.client_documents add constraint client_documents_added_by_fkey foreign key (added_by) references profiles(id) on delete set null;
alter table public.client_documents add constraint client_documents_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.client_documents add constraint client_documents_project_id_fkey foreign key (project_id) references projects(id) on delete set null;
alter table public.client_portals add constraint client_portals_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.clients add constraint clients_account_owner_fkey foreign key (account_owner) references profiles(id) on delete set null;
alter table public.deals add constraint deals_account_owner_fkey foreign key (account_owner) references profiles(id) on delete set null;
alter table public.deals add constraint deals_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.goals add constraint goals_owner_fkey foreign key (owner) references profiles(id) on delete set null;
alter table public.invoices add constraint invoices_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.invoices add constraint invoices_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;
alter table public.invoices add constraint invoices_deal_id_fkey foreign key (deal_id) references deals(id) on delete set null;
alter table public.key_results add constraint key_results_goal_id_fkey foreign key (goal_id) references goals(id) on delete cascade;
alter table public.meeting_requests add constraint meeting_requests_activity_id_fkey foreign key (activity_id) references activities(id) on delete set null;
alter table public.meeting_requests add constraint meeting_requests_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.meeting_requests add constraint meeting_requests_requested_by_fkey foreign key (requested_by) references profiles(id) on delete set null;
alter table public.notifications add constraint notifications_recipient_id_fkey foreign key (recipient_id) references profiles(id) on delete cascade;
alter table public.onboarding_tasks add constraint onboarding_tasks_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;
alter table public.onboarding_template_items add constraint onboarding_template_items_template_id_fkey foreign key (template_id) references onboarding_templates(id) on delete cascade;
alter table public.portal_messages add constraint portal_messages_author_id_fkey foreign key (author_id) references profiles(id) on delete set null;
alter table public.portal_messages add constraint portal_messages_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.portal_updates add constraint portal_updates_author_id_fkey foreign key (author_id) references profiles(id) on delete set null;
alter table public.portal_updates add constraint portal_updates_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.profile_emails add constraint profile_emails_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;
alter table public.profiles add constraint profiles_client_id_fkey foreign key (client_id) references clients(id) on delete set null;
alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
alter table public.profiles add constraint profiles_reports_to_fkey foreign key (reports_to) references profiles(id) on delete set null;
alter table public.profiles add constraint profiles_role_id_fkey foreign key (role_id) references roles(id) on delete set null;
alter table public.project_allocations add constraint project_allocations_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;
alter table public.project_allocations add constraint project_allocations_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;
alter table public.project_tasks add constraint project_tasks_approved_by_fkey foreign key (approved_by) references profiles(id) on delete set null;
alter table public.project_tasks add constraint project_tasks_assigned_to_fkey foreign key (assigned_to) references profiles(id) on delete set null;
alter table public.project_tasks add constraint project_tasks_project_id_fkey foreign key (project_id) references projects(id) on delete cascade;
alter table public.project_tasks add constraint project_tasks_recurrence_parent_id_fkey foreign key (recurrence_parent_id) references project_tasks(id) on delete set null;
alter table public.projects add constraint projects_client_id_fkey foreign key (client_id) references clients(id) on delete cascade;
alter table public.projects add constraint projects_deal_id_fkey foreign key (deal_id) references deals(id) on delete set null;
alter table public.projects add constraint projects_owner_fkey foreign key (owner) references profiles(id) on delete set null;
alter table public.roles add constraint roles_template_id_fkey foreign key (template_id) references onboarding_templates(id) on delete set null;
alter table public.staff_payments add constraint staff_payments_profile_id_fkey foreign key (profile_id) references profiles(id) on delete cascade;
alter table public.task_comments add constraint task_comments_author_id_fkey foreign key (author_id) references profiles(id) on delete set null;
alter table public.task_comments add constraint task_comments_task_id_fkey foreign key (task_id) references project_tasks(id) on delete cascade;
alter table public.task_items add constraint task_items_task_id_fkey foreign key (task_id) references project_tasks(id) on delete cascade;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Indexes
-- ═══════════════════════════════════════════════════════════════════════
-- Every foreign key gets one: Postgres does not index the referencing side,
-- and without it a parent delete scans the whole child table.

create index if not exists idx_activities_assigned_to on public.activities using btree (assigned_to);
create index if not exists idx_activities_client_id on public.activities using btree (client_id);
create index if not exists idx_activities_deal_id on public.activities using btree (deal_id);
create index if not exists idx_activities_recurrence_parent on public.activities using btree (recurrence_parent_id);
create index if not exists idx_applicants_role_id on public.applicants using btree (role_id);
create index if not exists idx_applicants_stage on public.applicants using btree (stage);
-- Partial: the query is always "show me the shortlist", never "show me
-- everyone I haven't starred", so indexing the false rows is dead weight.
create index if not exists idx_applicants_shortlisted on public.applicants using btree (shortlisted) where shortlisted;
create index if not exists idx_client_documents_added_by on public.client_documents using btree (added_by);
create index if not exists idx_client_documents_client_id on public.client_documents using btree (client_id);
create index if not exists idx_client_documents_project_id on public.client_documents using btree (project_id);
create index if not exists idx_client_portals_client_id on public.client_portals using btree (client_id);
create index if not exists idx_clients_account_owner on public.clients using btree (account_owner);
create index if not exists idx_clients_status on public.clients using btree (status);
create index if not exists idx_deals_account_owner on public.deals using btree (account_owner);
create index if not exists idx_deals_client_id on public.deals using btree (client_id);
create index if not exists idx_deals_stage on public.deals using btree (deal_stage);
create index if not exists idx_goals_owner on public.goals using btree (owner);
create index if not exists idx_invoices_client_id on public.invoices using btree (client_id);
create index if not exists idx_invoices_created_by on public.invoices using btree (created_by);
create index if not exists idx_invoices_deal_id on public.invoices using btree (deal_id);
create index if not exists idx_key_results_goal_id on public.key_results using btree (goal_id);
create index if not exists idx_meeting_requests_activity_id on public.meeting_requests using btree (activity_id);
create index if not exists idx_meeting_requests_client_id on public.meeting_requests using btree (client_id);
create index if not exists idx_meeting_requests_requested_by on public.meeting_requests using btree (requested_by);
create index if not exists idx_notifications_recipient on public.notifications using btree (recipient_id, read_at);
create index if not exists idx_notifications_recipient_id on public.notifications using btree (recipient_id);
create index if not exists idx_onboarding_tasks_profile on public.onboarding_tasks using btree (profile_id);
create index if not exists idx_onboarding_template_items_template on public.onboarding_template_items using btree (template_id);
create index if not exists idx_portal_messages_author_id on public.portal_messages using btree (author_id);
create index if not exists idx_portal_messages_client_id on public.portal_messages using btree (client_id);
create index if not exists idx_portal_updates_author_id on public.portal_updates using btree (author_id);
create index if not exists idx_portal_updates_client_id on public.portal_updates using btree (client_id);
create index if not exists idx_profile_emails_email on public.profile_emails using btree (email);
create index if not exists idx_profiles_client_id on public.profiles using btree (client_id);
create index if not exists idx_profiles_reports_to on public.profiles using btree (reports_to);
create index if not exists idx_profiles_role_id on public.profiles using btree (role_id);
create index if not exists idx_project_allocations_profile on public.project_allocations using btree (profile_id);
create index if not exists idx_project_allocations_project on public.project_allocations using btree (project_id);
create index if not exists idx_project_tasks_approved_by on public.project_tasks using btree (approved_by);
create index if not exists idx_project_tasks_assigned_to on public.project_tasks using btree (assigned_to);
create index if not exists idx_project_tasks_due_date on public.project_tasks using btree (due_date);
create index if not exists idx_project_tasks_priority on public.project_tasks using btree (priority);
create index if not exists idx_project_tasks_project_id on public.project_tasks using btree (project_id);
create index if not exists idx_project_tasks_recurrence_parent on public.project_tasks using btree (recurrence_parent_id);
create index if not exists idx_projects_client_id on public.projects using btree (client_id);
create index if not exists idx_projects_deal_id on public.projects using btree (deal_id);
-- GIN, because membership is `auth.uid() = any(member_ids)` — a btree can't
-- answer that.
create index if not exists idx_projects_member_ids on public.projects using gin (member_ids);
create index if not exists idx_projects_owner on public.projects using btree (owner);
create index if not exists idx_projects_status on public.projects using btree (status);
create index if not exists idx_roles_template_id on public.roles using btree (template_id);
create index if not exists idx_staff_payments_profile on public.staff_payments using btree (profile_id);
create index if not exists idx_task_comments_author_id on public.task_comments using btree (author_id);
create index if not exists idx_task_comments_task_id on public.task_comments using btree (task_id);
create index if not exists idx_task_items_task_id on public.task_items using btree (task_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Helper functions
-- ═══════════════════════════════════════════════════════════════════════
--
-- All SECURITY DEFINER with a pinned search_path. Definer because a policy on
-- `profiles` that reads `profiles` to decide access would recurse; the helper
-- runs as owner and sidesteps RLS. Pinned search_path because a definer
-- function without one can be hijacked by a caller-controlled schema.
--
-- Do NOT revoke EXECUTE on these from `authenticated`. A policy expression is
-- evaluated with the *caller's* privileges, so revoking turns every guarded
-- query into "permission denied" rather than hardening anything. The
-- trigger-only functions further down are a different matter — see the grants
-- block at the end.

create or replace function public.current_role_name()
returns user_role language sql stable security definer set search_path to 'public' as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_pages()
returns text[] language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(r.pages, '{}'::text[])
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- The hinge of the whole access model.
create or replace function public.current_can(page text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case
    when public.current_role_name() = 'admin' then true
    when public.current_role_name() = 'client' then false
    else page = any(coalesce(public.current_pages(), '{}'::text[]))
  end;
$$;

-- Admin by account type OR by a role carrying the flag. Both paths matter:
-- the owner is `role = 'admin'`, but an ops lead can be full_time on a role
-- with is_admin.
create or replace function public.current_is_admin()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select public.current_role_name() = 'admin'
      or coalesce(
           (select r.is_admin
            from public.profiles p
            join public.roles r on r.id = p.role_id
            where p.id = auth.uid()),
           false
         );
$$;

-- Exists because inlining this EXISTS inside a policy on `projects` created a
-- loop: the subquery read `project_tasks`, whose own policy read back from
-- `projects`. Postgres reported "infinite recursion detected in policy for
-- relation projects" and project creation stopped working entirely. A definer
-- function breaks the cycle because it doesn't re-enter RLS.
create or replace function public.has_task_in_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.project_tasks t
    where t.project_id = p_project_id and t.assigned_to = auth.uid()
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.projects p
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

-- Fans a notification out to everyone who'd care. Note it is deliberately
-- NOT `role in ('admin','full_time')` — a part-timer granted Clients should
-- hear about a client message, and a full-timer without either grant should
-- not. An earlier version hardcoded 'rep', which the enum rename made a
-- non-existent literal, and every notification path failed silently for days.
create or replace function public.notify_staff(p_type text, p_body text, p_link text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
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
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Runs on every auth.users insert. The 'full_time' fallback was 'rep' until
-- the enum rename orphaned it, at which point EVERY signup — staff and portal
-- alike — failed on a cast to a value that no longer existed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  insert into public.profiles (id, full_name, role, client_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'full_time'),
    nullif(new.raw_user_meta_data->>'client_id', '')::uuid
  );

  insert into public.profile_emails (profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do update set email = excluded.email;

  return new;
end;
$$;

create or replace function public.seed_onboarding_tasks()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_template uuid;
begin
  if new.role = 'client' then return new; end if;
  select id into v_template from public.onboarding_templates where is_default limit 1;
  if v_template is null then return new; end if;
  insert into public.onboarding_tasks (profile_id, title, sort_order)
  select new.id, i.title, i.sort_order
  from public.onboarding_template_items i
  where i.template_id = v_template;
  return new;
end;
$$;

create or replace function public.enforce_single_default_template()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.is_default then
    update public.onboarding_templates set is_default = false
    where id <> new.id and is_default;
  end if;
  return new;
end;
$$;

create or replace function public.on_task_comment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role public.user_role; v_company text; v_project uuid;
begin
  select role into v_role from public.profiles where id = new.author_id;
  if v_role = 'client' then
    select c.company, t.project_id into v_company, v_project
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    join public.clients c on c.id = p.client_id
    where t.id = new.task_id;
    perform public.notify_staff('comment',
      coalesce(v_company, 'A client') || ' commented: ' || left(new.body, 90),
      '/projects/' || v_project);
  end if;
  return new;
end;
$$;

create or replace function public.on_portal_message()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role public.user_role; v_company text;
begin
  select role into v_role from public.profiles where id = new.author_id;
  if v_role = 'client' then
    select company into v_company from public.clients where id = new.client_id;
    perform public.notify_staff('message',
      coalesce(v_company, 'A client') || ' sent a message: ' || left(new.body, 90),
      '/clients/' || new.client_id || '?tab=portal');
  end if;
  return new;
end;
$$;

create or replace function public.on_meeting_request()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_company text;
begin
  select company into v_company from public.clients where id = new.client_id;
  perform public.notify_staff('meeting_request',
    coalesce(v_company, 'A client') || ' requested a call: ' || left(new.topic, 90),
    '/clients/' || new.client_id || '?tab=portal');
  return new;
end;
$$;

-- Client-callable RPCs. These two are the exception to the "trigger functions
-- shouldn't be reachable over PostgREST" rule — the portal calls them
-- directly, and both scope their own writes to current_client_id().
create or replace function public.approve_task(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_client uuid; v_name text; v_company text; v_project uuid;
begin
  select client_id into v_client from public.profiles where id = auth.uid();
  if v_client is null then
    return; -- staff approve directly through normal updates
  end if;

  update public.project_tasks t
  set approved_at = now(), approved_by = auth.uid()
  from public.projects p
  where t.id = p_task_id and p.id = t.project_id
    and p.client_id = v_client and t.approved_at is null;

  if not found then return; end if;

  select t.name, c.company, t.project_id into v_name, v_company, v_project
  from public.project_tasks t
  join public.projects p on p.id = t.project_id
  join public.clients c on c.id = p.client_id
  where t.id = p_task_id;

  perform public.notify_staff('approval',
    coalesce(v_company, 'Client') || ' approved "' || v_name || '"',
    '/projects/' || v_project);
end;
$$;

create or replace function public.touch_portal()
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_first boolean; v_company text;
begin
  select (cp.last_opened_at is null), c.company into v_first, v_company
  from public.client_portals cp
  join public.clients c on c.id = cp.client_id
  where cp.client_id = public.current_client_id()
  limit 1;

  update public.client_portals
  set last_opened_at = now()
  where client_id = public.current_client_id();

  if coalesce(v_first, false) then
    perform public.notify_staff('portal',
      coalesce(v_company, 'A client') || ' opened their portal for the first time',
      '/portals');
  end if;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Views
-- ═══════════════════════════════════════════════════════════════════════

-- security_invoker matters here. Without it the view runs as its owner and
-- bypasses RLS on profiles entirely, which is what Supabase's advisor flagged
-- as CRITICAL: the staff roster was readable by anyone, signed in or not.
create or replace view public.team_directory with (security_invoker = true) as
  select id, full_name, avatar_url, role
  from public.profiles
  where role <> 'client'::user_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Triggers
-- ═══════════════════════════════════════════════════════════════════════

create trigger applicants_set_updated_at before update on public.applicants for each row execute function set_updated_at();
create trigger client_portals_set_updated_at before update on public.client_portals for each row execute function set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function set_updated_at();
create trigger deals_set_updated_at before update on public.deals for each row execute function set_updated_at();
create trigger goals_set_updated_at before update on public.goals for each row execute function set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function set_updated_at();
create trigger project_tasks_set_updated_at before update on public.project_tasks for each row execute function set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function set_updated_at();

create trigger meeting_request_notify after insert on public.meeting_requests for each row execute function on_meeting_request();
create trigger portal_message_notify after insert on public.portal_messages for each row execute function on_portal_message();
create trigger task_comment_notify after insert on public.task_comments for each row execute function on_task_comment();
create trigger profile_seed_onboarding after insert on public.profiles for each row execute function seed_onboarding_tasks();
create trigger onboarding_template_single_default after insert or update on public.onboarding_templates for each row execute function enforce_single_default_template();

-- Lives on auth.users, so it isn't in the public-schema dump above.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Row level security
-- ═══════════════════════════════════════════════════════════════════════
--
-- Two things to hold in mind reading these:
--   * Permissive policies are OR'd. A table with a `*_page_all` policy and a
--     client-scoped SELECT grants the union, not the intersection.
--   * `using` doubles as `with check` when the latter is absent on an ALL
--     policy — but only for UPDATE, and NOT for INSERT. An ALL policy with
--     only `using` lets anyone insert anything, which is why every one below
--     spells out `with check`.

alter table public.activities enable row level security;
alter table public.app_settings enable row level security;
alter table public.applicants enable row level security;
alter table public.client_documents enable row level security;
alter table public.client_portals enable row level security;
alter table public.clients enable row level security;
alter table public.deals enable row level security;
alter table public.goals enable row level security;
alter table public.invoices enable row level security;
alter table public.key_results enable row level security;
alter table public.meeting_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.onboarding_template_items enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.portal_messages enable row level security;
alter table public.portal_updates enable row level security;
alter table public.profile_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.project_allocations enable row level security;
alter table public.project_tasks enable row level security;
alter table public.projects enable row level security;
alter table public.roles enable row level security;
alter table public.staff_payments enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_items enable row level security;
alter table public.teams enable row level security;

-- ── Clients, deals, portals ──────────────────────────────────────────────
create policy clients_page_all on public.clients for all
  using (current_can('clients')) with check (current_can('clients'));
create policy clients_client_select_own on public.clients for select
  using (current_role_name() = 'client' and id = current_client_id());

create policy deals_page_all on public.deals for all
  using (current_can('pipeline')) with check (current_can('pipeline'));
create policy deals_client_select_own on public.deals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

create policy portals_page_all on public.client_portals for all
  using (current_can('clients')) with check (current_can('clients'));
create policy portals_client_select_own on public.client_portals for select
  using (current_role_name() = 'client' and client_id = current_client_id());

create policy portal_updates_page_all on public.portal_updates for all
  using (current_can('clients')) with check (current_can('clients'));
create policy portal_updates_client_select on public.portal_updates for select
  using (current_role_name() = 'client' and client_id = current_client_id());

create policy portal_messages_page_all on public.portal_messages for all
  using (current_can('clients')) with check (current_can('clients'));
create policy portal_messages_client_select on public.portal_messages for select
  using (current_role_name() = 'client' and client_id = current_client_id());
-- author_id is pinned to auth.uid() so a client can't post as someone else.
create policy portal_messages_client_insert on public.portal_messages for insert
  with check (current_role_name() = 'client'
    and author_id = (select auth.uid())
    and client_id = current_client_id());

create policy client_documents_page_all on public.client_documents for all
  using (current_can('clients')) with check (current_can('clients'));
create policy client_documents_client_select on public.client_documents for select
  using (current_role_name() = 'client' and client_id = current_client_id());

-- Draft invoices are excluded, not just hidden in the UI. A client seeing a
-- figure you're still deciding on is worse than seeing nothing.
create policy invoices_page_all on public.invoices for all
  using (current_can('clients')) with check (current_can('clients'));
create policy invoices_client_select on public.invoices for select
  using (current_role_name() = 'client' and client_id = current_client_id()
    and status <> 'draft');

-- ── Projects and tasks ───────────────────────────────────────────────────
create policy projects_page_all on public.projects for all
  using (current_can('projects')) with check (current_can('projects'));
create policy projects_client_select_own on public.projects for select
  using (current_role_name() = 'client' and client_id = current_client_id());

create policy project_tasks_page_all on public.project_tasks for all
  using (current_can('projects')) with check (current_can('projects'));
create policy project_tasks_client_select_own on public.project_tasks for select
  using (current_role_name() = 'client'
    and project_id in (select id from projects where client_id = current_client_id()));
-- Contractors get exactly their own tasks and nothing else on the board.
create policy project_tasks_contractor_select_own on public.project_tasks for select
  using (current_role_name() = 'contract' and assigned_to = (select auth.uid()));
create policy project_tasks_contractor_update_own on public.project_tasks for update
  using (current_role_name() = 'contract' and assigned_to = (select auth.uid()))
  with check (current_role_name() = 'contract' and assigned_to = (select auth.uid()));

create policy task_items_page_all on public.task_items for all
  using (current_can('projects')) with check (current_can('projects'));
create policy task_items_client_select_own on public.task_items for select
  using (current_role_name() = 'client'
    and task_id in (select t.id from project_tasks t join projects p on p.id = t.project_id
                    where p.client_id = current_client_id()));

create policy task_comments_page_all on public.task_comments for all
  using (current_can('projects')) with check (current_can('projects'));
create policy task_comments_client_select on public.task_comments for select
  using (current_role_name() = 'client'
    and task_id in (select t.id from project_tasks t join projects p on p.id = t.project_id
                    where p.client_id = current_client_id()));
create policy task_comments_client_insert on public.task_comments for insert
  with check (current_role_name() = 'client'
    and author_id = (select auth.uid())
    and task_id in (select t.id from project_tasks t join projects p on p.id = t.project_id
                    where p.client_id = current_client_id()));

-- ── Money ────────────────────────────────────────────────────────────────
-- Everyone can see what they personally are owed; only Accounts sees the rest.
create policy project_allocations_accounts_all on public.project_allocations for all
  using (current_can('accounts')) with check (current_can('accounts'));
create policy project_allocations_own_select on public.project_allocations for select
  using (profile_id = (select auth.uid()));

create policy staff_payments_admin_all on public.staff_payments for all
  using (current_is_admin()) with check (current_is_admin());
create policy staff_payments_own_select on public.staff_payments for select
  using (profile_id = (select auth.uid()));

-- ── Schedule ─────────────────────────────────────────────────────────────
create policy activities_page_all on public.activities for all
  using (current_can('schedule')) with check (current_can('schedule'));
create policy activities_client_select on public.activities for select
  using (current_role_name() = 'client' and client_visible = true
    and client_id = current_client_id());
create policy activities_contractor_select_own on public.activities for select
  using (current_role_name() = 'contract' and assigned_to = (select auth.uid()));

create policy meeting_requests_page_all on public.meeting_requests for all
  using (current_can('schedule') or current_can('clients'))
  with check (current_can('schedule') or current_can('clients'));
create policy meeting_requests_client_select on public.meeting_requests for select
  using (current_role_name() = 'client' and client_id = current_client_id());
create policy meeting_requests_client_insert on public.meeting_requests for insert
  with check (current_role_name() = 'client'
    and requested_by = (select auth.uid())
    and client_id = current_client_id());

-- ── Goals, recruiting, onboarding ────────────────────────────────────────
create policy goals_manage on public.goals for all
  using (current_can('goals')) with check (current_can('goals'));
create policy key_results_manage on public.key_results for all
  using (current_can('goals')) with check (current_can('goals'));

create policy applicants_recruiting_all on public.applicants for all
  using (current_can('recruiting')) with check (current_can('recruiting'));

-- Recruiting needs templates too — it assigns one at hire time.
create policy onboarding_templates_manage on public.onboarding_templates for all
  using (current_can('onboarding') or current_can('recruiting'))
  with check (current_can('onboarding') or current_can('recruiting'));
create policy onboarding_template_items_manage on public.onboarding_template_items for all
  using (current_can('onboarding') or current_can('recruiting'))
  with check (current_can('onboarding') or current_can('recruiting'));

create policy onboarding_tasks_manage on public.onboarding_tasks for all
  using (current_can('onboarding')) with check (current_can('onboarding'));
-- A new hire ticks off their own checklist without any page grant at all.
create policy onboarding_tasks_own_select on public.onboarding_tasks for select
  using (profile_id = (select auth.uid()));
create policy onboarding_tasks_own_update on public.onboarding_tasks for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ── People and access ────────────────────────────────────────────────────
-- Staff rows are readable by everyone signed in, clients included: they need
-- to see who's assigned to their work. Accepted trade — clients can therefore
-- read team/title/start_date. If that ever matters, those columns move to a
-- profile_details table the same way email did.
create policy profiles_select_staff on public.profiles for select
  using (role <> 'client' or id = (select auth.uid()));
create policy profiles_admin_all on public.profiles for all
  using (current_role_name() = 'admin');
-- You may edit yourself, but not promote yourself or reassign your own client.
create policy profiles_update_self on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid())
    and role = (select current_role_name())
    and not (client_id is distinct from (select current_client_id())));

-- Emails live here precisely so clients never see them.
create policy profile_emails_staff_select on public.profile_emails for select
  using (current_role_name() <> 'client');
create policy profile_emails_own_select on public.profile_emails for select
  using (profile_id = (select auth.uid()));
create policy profile_emails_admin_write on public.profile_emails for all
  using (current_is_admin()) with check (current_is_admin());

-- Readable by all, writable by admins. Everyone's sidebar is computed from
-- `roles`, so a person has to be able to read their own row; only an admin
-- may change what it grants.
create policy roles_read on public.roles for select using (true);
create policy roles_admin_write on public.roles for all
  using (current_is_admin()) with check (current_is_admin());

create policy teams_read on public.teams for select using (true);
create policy teams_page_write on public.teams for all
  using (current_can('team')) with check (current_can('team'));

-- ── Notifications and settings ───────────────────────────────────────────
create policy notifications_own_select on public.notifications for select
  using (recipient_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create policy notifications_staff_insert on public.notifications for insert
  with check (current_role_name() = any (array['admin','full_time']::user_role[]));

create policy app_settings_read on public.app_settings for select using (true);
create policy app_settings_admin_write on public.app_settings for all
  using (current_is_admin()) with check (current_is_admin());

-- ═══════════════════════════════════════════════════════════════════════
-- 10. Grants
-- ═══════════════════════════════════════════════════════════════════════
--
-- Every SECURITY DEFINER function in `public` is exposed by PostgREST at
-- /rest/v1/rpc/<name> by default. For trigger functions that's a hole, not a
-- feature: notify_staff was callable by `anon` with arbitrary text, which is a
-- phishing channel straight into the team's notification bell — no login
-- required. Revoke the trigger-only ones and keep the two the portal actually
-- calls.

revoke execute on function public.notify_staff(text, text, text) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.seed_onboarding_tasks() from anon, authenticated;
revoke execute on function public.enforce_single_default_template() from anon, authenticated;
revoke execute on function public.on_task_comment() from anon, authenticated;
revoke execute on function public.on_portal_message() from anon, authenticated;
revoke execute on function public.on_meeting_request() from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated;

-- The portal calls these two directly; both scope their writes internally.
grant execute on function public.approve_task(uuid) to authenticated;
grant execute on function public.touch_portal() to authenticated;

-- The staff roster is not public. This was readable by `anon` until the
-- advisor caught it.
revoke all on public.team_directory from anon;
grant select on public.team_directory to authenticated;

commit;
