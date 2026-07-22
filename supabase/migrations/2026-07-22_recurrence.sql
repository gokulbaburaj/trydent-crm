-- Trydent Labs CRM — Recurring tasks & schedule items
-- Run in the Supabase SQL editor (safe to re-run).
-- The "destructive operation" warning is expected — click Run anyway.

do $$ begin
  create type public.recurrence as enum ('none', 'daily', 'weekly', 'biweekly', 'monthly');
exception
  when duplicate_object then null;
end $$;

alter table public.project_tasks
  add column if not exists recurrence public.recurrence not null default 'none',
  add column if not exists recurrence_parent_id uuid references public.project_tasks(id) on delete set null;

alter table public.activities
  add column if not exists recurrence public.recurrence not null default 'none',
  add column if not exists recurrence_parent_id uuid references public.activities(id) on delete set null;

-- Fast "has a next occurrence already been created?" lookups.
create index if not exists idx_project_tasks_recurrence_parent
  on public.project_tasks(recurrence_parent_id);
create index if not exists idx_activities_recurrence_parent
  on public.activities(recurrence_parent_id);
