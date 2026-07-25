-- Trydent Labs CRM — Goals and key results
-- Phase 6 of the roadmap. Company OKRs with visualisation.
--
-- The important design choice: a key result's CURRENT value is not stored for
-- data-backed metrics. `source` names where the number comes from (won revenue,
-- closed deals, new clients, completed tasks, paid invoices) and the app
-- computes it live from rows already in the database, scoped to the goal's
-- period. Only `manual` key results carry a hand-entered `current_manual`.
--
-- This is what stops OKRs going stale. A number nobody has to remember to
-- update is a number that stays true.
--
-- Staff-only throughout: clients and contractors match no policy here, so the
-- tables are invisible to them.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  objective text not null,
  description text,
  owner uuid references public.profiles(id) on delete set null,
  period text not null default '',
  status text not null default 'on_track',
  start_date date,
  end_date date,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_status_valid
    check (status in ('on_track', 'at_risk', 'off_track', 'achieved'))
);

create table if not exists public.key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  name text not null,
  source text not null default 'manual',
  target numeric not null default 0,
  current_manual numeric not null default 0,
  unit text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint key_results_source_valid
    check (source in (
      'manual',
      'revenue_won',
      'deals_closed',
      'new_clients',
      'tasks_done',
      'invoices_paid'
    ))
);

create index if not exists idx_key_results_goal_id on public.key_results(goal_id);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.key_results enable row level security;

drop policy if exists "goals_staff_all" on public.goals;
create policy "goals_staff_all" on public.goals for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "key_results_staff_all" on public.key_results;
create policy "key_results_staff_all" on public.key_results for all
  using (public.current_role_name() in ('admin', 'rep'));
