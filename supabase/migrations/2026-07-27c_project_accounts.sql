-- Trydent Labs CRM — Project accounts
--
-- Two questions this answers: how much money is allotted to a project, and how
-- much of it is committed to the people working on it.
--
-- `projects.budget` is the allotment. `project_allocations` is one row per
-- person per project — what they're being paid for that work.
--
-- Money is stored in the project's own currency, same convention as deals, so
-- a project quoted in INR doesn't get silently reported in USD.
--
-- Staff-only, with contractors able to see their OWN allocations (they can
-- already see their staff_payments, so hiding this would be inconsistent).
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.projects add column if not exists budget numeric not null default 0;
alter table public.projects add column if not exists currency text not null default 'USD';

create table if not exists public.project_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null default 0,
  role_label text,
  note text,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create index if not exists idx_project_allocations_project
  on public.project_allocations(project_id);
create index if not exists idx_project_allocations_profile
  on public.project_allocations(profile_id);

alter table public.project_allocations enable row level security;

drop policy if exists "project_allocations_staff_all" on public.project_allocations;
create policy "project_allocations_staff_all" on public.project_allocations for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "project_allocations_own_select" on public.project_allocations;
create policy "project_allocations_own_select" on public.project_allocations for select
  using (profile_id = auth.uid());
