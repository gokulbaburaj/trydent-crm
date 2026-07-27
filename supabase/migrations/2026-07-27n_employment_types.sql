-- Trydent Labs CRM — employment types, and separating them from access
--
-- Why
-- ---
-- `user_role` was ('admin', 'rep', 'client', 'contractor'). "rep" is a leftover
-- from when this was a sales CRM; it stopped meaning anything once the app grew
-- past the pipeline. And the four values were doing two unrelated jobs at once:
-- describing someone's relationship to the company, AND deciding what they
-- could see.
--
-- Since 2026-07-27k, access comes from the job role's grants. So this column
-- can go back to being what it should always have been — an HR fact.
--
--   admin      keys to everything, bypasses grants   (an account kind)
--   full_time  employment type
--   part_time  employment type
--   contract   employment type
--   intern     employment type
--   client     external, portal only                 (an account kind)
--
-- An intern and a full-timer can be video editors with identical access; a
-- part-time project manager may need more than either. None of the four
-- employment types grants anything by itself.
--
-- The one thing the old 'contractor' value did carry that isn't employment —
-- "show them the cut-down staff portal" — moves to profiles.portal_only, a
-- per-person toggle. Some contractors are embedded in the team and want the
-- real project board; others touch one job and are better off with one screen.
-- That's a call per person, not something to infer from a contract term.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- NOTE ON POLICIES: none need rewriting. `alter type ... rename value` changes
-- the label only — the enum member keeps its OID, and every policy comparing
-- against it was compiled to that OID. They'll simply render with the new name
-- in pg_policies afterwards.


-- ============================================================================
-- 1. Rename what exists
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'rep'
  ) then
    alter type public.user_role rename value 'rep' to 'full_time';
  end if;

  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'contractor'
  ) then
    alter type public.user_role rename value 'contractor' to 'contract';
  end if;
end $$;


-- ============================================================================
-- 2. Add the two new ones
-- ============================================================================

alter type public.user_role add value if not exists 'part_time';
alter type public.user_role add value if not exists 'intern';


-- ============================================================================
-- 3. Which surface each person lands on
-- ============================================================================

alter table public.profiles
  add column if not exists portal_only boolean not null default false;

comment on column public.profiles.portal_only is
  'Send this person to the cut-down /staff-portal instead of the full app. '
  'Independent of employment type — an embedded contractor can have the full '
  'app, a part-timer can be portal-only.';

-- Preserve today's behaviour exactly: everyone who was a 'contractor' was on
-- the staff portal, so they stay there until you decide otherwise in Team.
-- Guarded on the column being fresh so a re-run can't undo your choices.
update public.profiles
set portal_only = true
where role = 'contract'
  and portal_only = false
  and not exists (
    select 1 from public.profiles p2 where p2.portal_only = true
  );


-- ============================================================================
-- 4. Default new staff to full-time
-- ============================================================================
-- The old column default was 'rep', which is now 'full_time' — correct by
-- accident, but worth stating rather than relying on the rename.

alter table public.profiles alter column role set default 'full_time';


-- ============================================================================
-- Check
-- ============================================================================
--
--   select unnest(enum_range(null::public.user_role)) as account_types;
--
--   select full_name, role, portal_only from public.profiles order by role;
--
-- Expect: Gokul admin/false, Ravi and Albert contract/true. Flip portal_only
-- to false for whichever of them should get the full app — and if you do,
-- run 2026-07-27m first so the pages they land on have data behind them.
