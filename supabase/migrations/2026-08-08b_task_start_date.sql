-- ============================================================================
-- project_tasks.start_date — a task can span days
-- ============================================================================
--
-- Until now a task was a single day: `due_date`, plus an optional `due_time`
-- and `end_time` *within* that day (2026-08-03d). That's right for "call the
-- client at 3pm" and wrong for "Week 3", which is what the real data looks
-- like — tasks named for weeks and multi-part deliverables.
--
-- The form made this worse by labelling the time fields "Starts" and "Ends"
-- directly under "Due date", so they read as a start DATE. Those labels are
-- corrected in the same change.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
-- Nullable. A task with no start_date is still a single-day task on its
-- due_date, which is every task that exists today — no backfill, no behaviour
-- change for anything already entered.
--
-- The constraint only bites when BOTH dates are present. A start with no due
-- date is allowed (open-ended work) and so is a due date with no start (the
-- current shape).

alter table public.project_tasks
  add column if not exists start_date date;

comment on column public.project_tasks.start_date is
  'Optional first day of a multi-day task. Null means the task lives entirely on due_date. Must be <= due_date when both are set.';

-- Guarded: if any existing row would violate this, fail loudly rather than let
-- ADD CONSTRAINT reject the whole migration with a less useful message.
do $$
declare
  bad int;
begin
  select count(*) into bad
  from public.project_tasks
  where start_date is not null
    and due_date is not null
    and start_date > due_date;

  if bad > 0 then
    raise exception 'Refusing to add constraint: % task(s) already have start_date > due_date', bad;
  end if;
end $$;

alter table public.project_tasks
  drop constraint if exists project_tasks_start_before_due;

alter table public.project_tasks
  add constraint project_tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);


-- ============================================================================
-- Verify
-- ============================================================================
--   -- 1. Column and constraint exist.
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='project_tasks'
--     and column_name='start_date';
--   -- expect: 1 row, date, YES
--
--   select conname from pg_constraint
--   where conrelid='public.project_tasks'::regclass
--     and conname='project_tasks_start_before_due';
--   -- expect: 1 row
--
--   -- 2. Nothing was disturbed. Every existing task still has a null start.
--   select count(*) as with_start from public.project_tasks where start_date is not null;
--   -- expect: 0 immediately after this migration
--
--   -- 3. The constraint actually rejects a bad range.
--   --   begin;
--   --     update public.project_tasks
--   --     set start_date = due_date + 1
--   --     where due_date is not null limit 1;   -- expect: constraint violation
--   --   rollback;
