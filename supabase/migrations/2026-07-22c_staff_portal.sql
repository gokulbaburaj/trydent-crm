-- Trydent Labs CRM — Staff portal: payment plans + contractor access
-- Run this AFTER 2026-07-22b_contractor_role.sql. Safe to re-run.
-- The "destructive operation" warning is expected — click Run anyway.

-- ============ PAYMENT PLANS ============
create table if not exists public.staff_payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  amount numeric not null default 0,
  status text not null default 'pending', -- 'pending' | 'paid'
  due_date date,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_payments_profile on public.staff_payments(profile_id);

alter table public.staff_payments enable row level security;

-- Staff (admin/rep) manage everyone's plans; a person can read their own.
drop policy if exists "staff_payments_staff_all" on public.staff_payments;
create policy "staff_payments_staff_all" on public.staff_payments for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "staff_payments_own_select" on public.staff_payments;
create policy "staff_payments_own_select" on public.staff_payments for select
  using (profile_id = auth.uid());

-- ============ CONTRACTOR ACCESS ============
-- Contractors only ever read their OWN assigned tasks and schedule items.
-- They match no policy on clients/deals/projects, so those stay invisible.
drop policy if exists "project_tasks_contractor_select_own" on public.project_tasks;
create policy "project_tasks_contractor_select_own" on public.project_tasks for select
  using (public.current_role_name() = 'contractor' and assigned_to = auth.uid());

-- Contractors may update their own assigned tasks (e.g. mark status done).
drop policy if exists "project_tasks_contractor_update_own" on public.project_tasks;
create policy "project_tasks_contractor_update_own" on public.project_tasks for update
  using (public.current_role_name() = 'contractor' and assigned_to = auth.uid());

drop policy if exists "activities_contractor_select_own" on public.activities;
create policy "activities_contractor_select_own" on public.activities for select
  using (public.current_role_name() = 'contractor' and assigned_to = auth.uid());
