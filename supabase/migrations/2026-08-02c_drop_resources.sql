-- Trydent Labs CRM — remove the Resources feature
--
-- Reverses 2026-08-01a_resources.sql and the block-editor column added in
-- 2026-08-02a_resource_blocks.sql.
--
-- Why
-- ---
-- Notes moved back to Notion. Building a block editor inside the CRM was a
-- week of work to end up with a worse version of a tool the team already pays
-- for and already knows. The CRM's job is clients, deals, projects and money;
-- Notion's job is documents. Neither is improved by pretending to be the other.
--
-- What is destroyed
-- -----------------
-- One test note. Confirmed before writing this: `select count(*) from
-- resources` returned 1, titled "TEST 1", body "jbjn". If that number is not 1
-- when you run this, STOP and look at what's in there first.
--
-- What is deliberately NOT dropped
-- --------------------------------
-- `private.current_role_id()` stays. It was added for this feature, but it's a
-- generic helper — "which job role is the caller" — and it costs nothing to
-- keep. Dropping it would mean re-adding it the first time any other feature
-- needs role-scoped RLS, which Channels probably will.
--
-- The `private` schema stays for the same reason: it holds all eight RLS
-- helpers and is nothing to do with Resources.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Safety check — refuse to run if there's more than the one test note
-- ============================================================================

do $$
declare
  n integer;
begin
  if to_regclass('public.resources') is null then
    raise notice 'resources table already gone — nothing to do';
    return;
  end if;

  select count(*) into n from public.resources;

  if n > 1 then
    raise exception
      'resources holds % rows, not the 1 test note this migration expects. '
      'Export anything worth keeping, then delete this guard and re-run.', n;
  end if;

  raise notice 'dropping resources (% row)', n;
end$$;


-- ============================================================================
-- 2. Drop
-- ============================================================================
-- Policies, indexes, the trigger and the constraint all go with the table.

drop table if exists public.resources;

drop function if exists private.touch_resource();

drop type if exists public.resource_kind;
drop type if exists public.resource_visibility;


-- ============================================================================
-- 3. Take the page grant off every role
-- ============================================================================
-- Left behind, `roles.pages` would carry a key no route answers to. Harmless
-- today, confusing in six months when someone reads the array and goes looking
-- for the page.

update public.roles
set pages = array_remove(pages, 'resources')
where 'resources' = any(pages);


-- ============================================================================
-- Verify
-- ============================================================================
--   select to_regclass('public.resources');            -- expect: null
--   select count(*) from pg_type
--    where typname in ('resource_kind','resource_visibility');  -- expect: 0
--   select name, pages from public.roles;              -- no 'resources' anywhere
