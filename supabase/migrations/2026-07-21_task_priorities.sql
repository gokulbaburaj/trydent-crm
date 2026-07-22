-- Trydent Labs CRM — Task priorities
-- Run in the Supabase SQL editor (safe to re-run).

do $$ begin
  create type public.task_priority as enum ('urgent', 'high', 'normal', 'low');
exception
  when duplicate_object then null;
end $$;

alter table public.project_tasks
  add column if not exists priority public.task_priority not null default 'normal';

create index if not exists idx_project_tasks_priority on public.project_tasks(priority);
