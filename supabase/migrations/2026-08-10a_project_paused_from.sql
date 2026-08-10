-- ============================================================================
-- projects.paused_from — remember which phase a project paused in
-- ============================================================================
--
-- `status` is a single column, so putting a project On Hold overwrites the
-- phase it was in. The information isn't hidden, it's destroyed: nothing in the
-- row says whether it stalled during Planning or during Review.
--
-- The Focus view's stepper renders that honestly today — four phases, none
-- marked current, plus a paused terminal — because inferring a phase from
-- `updated_at` would be a guess wearing the costume of a fact. This column is
-- the actual fix.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
-- Nullable. Null means either "not paused" or "paused before this column
-- existed", and the UI treats both the same way: show the paused terminal with
-- no phase marked. No backfill — we genuinely don't know where the existing
-- On Hold projects stopped, and inventing a value would be worse than null.
--
-- Deliberately NOT a foreign key or an enum type. `status` is a plain text
-- column with a check constraint, and this has to hold the same vocabulary; a
-- second mechanism for the same set of strings is how the two drift.

alter table public.projects
  add column if not exists paused_from text;

comment on column public.projects.paused_from is
  'The phase a project was in when it moved to On Hold. Null when the project is not paused, or was paused before this column existed. Never Delivered or On Hold — see the check constraint.';

-- Guarded: fail loudly rather than let ADD CONSTRAINT reject the table with a
-- less useful message.
do $$
declare
  bad int;
begin
  select count(*) into bad
  from public.projects
  where paused_from is not null
    and paused_from not in ('Planning', 'In Progress', 'Review');

  if bad > 0 then
    raise exception 'Refusing to add constraint: % project(s) have an invalid paused_from', bad;
  end if;
end $$;

alter table public.projects
  drop constraint if exists projects_paused_from_valid;

-- Only the three phases a project can genuinely stall IN.
--
-- "Delivered" is excluded because pausing a shipped project is meaningless, and
-- "On Hold" because a project can't be paused from being paused — allowing it
-- would let the column point at itself after two consecutive holds.
alter table public.projects
  add constraint projects_paused_from_valid
  check (
    paused_from is null
    or paused_from in ('Planning', 'In Progress', 'Review')
  );

-- A value here only means anything while the project is actually On Hold.
-- Without this, resuming a project leaves a stale phase behind that the next
-- pause would silently inherit.
alter table public.projects
  drop constraint if exists projects_paused_from_only_when_held;

alter table public.projects
  add constraint projects_paused_from_only_when_held
  check (status = 'On Hold' or paused_from is null);


-- ============================================================================
-- Verify
-- ============================================================================
--   -- 1. Column and both constraints exist.
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='projects' and column_name='paused_from';
--   -- expect: 1 row, text, YES
--
--   select conname from pg_constraint
--   where conrelid='public.projects'::regclass
--     and conname in ('projects_paused_from_valid','projects_paused_from_only_when_held');
--   -- expect: 2 rows
--
--   -- 2. Nothing was disturbed.
--   select count(*) as with_paused_from from public.projects where paused_from is not null;
--   -- expect: 0 immediately after this migration
--
--   -- 3. The constraints actually bite.
--   --   begin;
--   --     update public.projects set paused_from='Delivered' where status='On Hold' limit 1;
--   --     -- expect: violates projects_paused_from_valid
--   --   rollback;
--   --   begin;
--   --     update public.projects set paused_from='Review' where status='In Progress' limit 1;
--   --     -- expect: violates projects_paused_from_only_when_held
--   --   rollback;
