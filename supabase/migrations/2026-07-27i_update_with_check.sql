-- Trydent Labs CRM — close the self-update privilege escalation
--
-- ############################################################################
-- # CRITICAL. Run this before anything else in the pending stack.            #
-- ############################################################################
--
-- Every UPDATE policy in this database was written with USING and no
-- WITH CHECK. Postgres treats that as: "if no WITH CHECK expression is
-- defined, the USING expression is used both to determine which rows are
-- visible and which new rows will be allowed."
--
-- So `profiles_update_self` — using (id = auth.uid()) — checks the NEW row
-- against `id = auth.uid()` as well. An update that changes `role` leaves `id`
-- untouched, so it passes:
--
--     update profiles set role = 'admin' where id = auth.uid();   -- allowed!
--
-- Any authenticated user could promote themselves to admin. A client portal
-- user could also repoint their own `client_id` at another client and read
-- that client's entire account through the normal RLS path, because every
-- client policy trusts current_client_id().
--
-- Supabase's advisor does not check for this. It only reported the pair as
-- "multiple permissive policies", which is a performance note.
--
-- The fix is a WITH CHECK that pins the privileged columns to their current
-- values. current_role_name() and current_client_id() are SECURITY DEFINER, so
-- reading them here does not re-enter profiles RLS and cannot recurse.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. profiles — the escalation path
-- ============================================================================
--
-- A user may still edit their own name and avatar from Settings. They may not
-- change their own role or move themselves between clients. Admin edits to
-- other people go through profiles_admin_all, and the team/portal API routes
-- use the service-role key, so neither path is affected.

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select public.current_role_name())
    and client_id is not distinct from (select public.current_client_id())
  );


-- ============================================================================
-- 2. The same omission on the other UPDATE policies
-- ============================================================================
--
-- None of these are escalation paths, but each one lets a row be edited out of
-- the editor's own scope — which is the same bug with a smaller blast radius.

-- A contractor may update a task assigned to them, but may not hand it to
-- somebody else or take it off themselves.
drop policy if exists "project_tasks_contractor_update_own" on public.project_tasks;
create policy "project_tasks_contractor_update_own" on public.project_tasks for update
  using (
    public.current_role_name() = 'contractor'
    and assigned_to = (select auth.uid())
  )
  with check (
    public.current_role_name() = 'contractor'
    and assigned_to = (select auth.uid())
  );

-- Ticking your own onboarding item may not reassign it to another person.
drop policy if exists "onboarding_tasks_own_update" on public.onboarding_tasks;
create policy "onboarding_tasks_own_update" on public.onboarding_tasks for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Marking a notification read may not re-address it.
drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));


-- ============================================================================
-- 3. Unindexed foreign keys (advisor category 7)
-- ============================================================================
--
-- Generated from the catalog rather than a hand-written list, so it can't fall
-- behind the schema. Honest framing: at current data volumes none of these
-- speed up a page load. What they do fix is deletes — removing one profile
-- currently sequentially scans every table holding an FK to it — and they
-- silence the last advisor category.
--
-- Expect some of these to reappear later under "unused index". That's the
-- linter noticing they've never been scanned, not a new problem.

do $$
declare
  fk record;
  idx_name text;
begin
  for fk in
    select
      c.conrelid::regclass::text as tbl,
      c.conname,
      (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
       from unnest(c.conkey) with ordinality k(attnum, ord)
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
      )
  loop
    idx_name := left('idx_' || replace(fk.conname, '_fkey', ''), 63);
    execute format('create index if not exists %I on %s (%s)', idx_name, fk.tbl, fk.cols);
    raise notice 'indexed %(%)', fk.tbl, fk.cols;
  end loop;
end $$;


-- ============================================================================
-- 4. Verify
-- ============================================================================
--
-- Run this afterwards. It should return zero rows. If profiles_update_self
-- comes back, the policy did not take and self-promotion is still possible.

-- select tablename, policyname
-- from pg_policies
-- where schemaname = 'public' and cmd in ('UPDATE', 'ALL') and with_check is null;
