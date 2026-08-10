-- Pin role_id (and team / reports_to) in profiles_update_self.
--
-- ============================================================================
-- The hole
-- ============================================================================
--
-- 2026-07-27i added a WITH CHECK to profiles_update_self, because UPDATE
-- policies fall back to their USING clause for the new row and `id =
-- auth.uid()` is satisfied by an update that changes anything except `id`.
-- That migration pinned the two privileged columns that existed at the time:
--
--     role       — the account type
--     client_id  — which client a portal user reads
--
-- One migration later, 27k added `roles.is_admin` and rewrote
-- current_is_admin() to consult it through profiles.role_id:
--
--     select private.current_role_name() = 'admin'
--         or coalesce((select r.is_admin
--                      from public.profiles p
--                      join public.roles r on r.id = p.role_id
--                      where p.id = auth.uid()), false)
--
-- That turned role_id into a privilege column retroactively. 27i was correct
-- when it was written and became incomplete without being touched. Nothing
-- flagged it: the advisor doesn't model WITH CHECK at all, and the two
-- migrations look unrelated in a directory listing.
--
-- The result was a one-line self-promotion from the browser console. `roles`
-- is world-readable (roles_read qual = true), so the Admin row's id doesn't
-- even need guessing:
--
--     await supabase.from('profiles')
--       .update({ role_id: '<the Admin role id>' })
--       .eq('id', myUserId);
--
-- USING passed (id unchanged), WITH CHECK passed (role and client_id
-- unchanged), and current_is_admin() then returned true — which is ALL on
-- staff_payments, roles, app_settings and profile_emails, plus channel and
-- message deletes. Eight policies key off it.
--
-- Verified as a `contract` account with is_admin false: staff_payments
-- returned 0 rows, then 1 row after the update above. Both tests ran inside a
-- rolled-back transaction.
--
-- ============================================================================
-- Why the helpers, and not a subselect
-- ============================================================================
--
-- The obvious form of this fix does not work, and fails loudly:
--
--     and role_id is not distinct from
--         (select p.role_id from public.profiles p where p.id = auth.uid())
--
--     ERROR: 42P17: infinite recursion detected in policy for relation "profiles"
--
-- A policy on profiles cannot read profiles — the subselect is itself subject
-- to the policies being evaluated. This is why 27i reached for
-- private.current_role_name() and private.current_client_id() rather than
-- writing the comparison inline, and the reason wasn't recorded there. It is
-- now. SECURITY DEFINER is what breaks the cycle: the helper runs as its owner
-- and skips RLS.
--
-- The three helpers below are deliberately dull, matching the two that already
-- exist in `private` exactly in shape. STABLE so the planner can hoist them,
-- `search_path` pinned per 2026-07-27t.
--
-- ============================================================================
-- Scope
-- ============================================================================
--
-- `is not distinct from` rather than `=` because all three columns are
-- nullable and `null = null` is null, which fails a WITH CHECK — that would
-- lock out anyone whose role_id or team is unset.
--
-- team and reports_to are pinned alongside role_id. Neither is read by any
-- policy today (checked: zero policies reference either), so neither is an
-- escalation path — it's the org chart, and someone shouldn't be able to
-- reassign their own manager. Pinning them now costs nothing and means the
-- next column that becomes load-bearing doesn't repeat 27i's story.
--
-- Admins are unaffected. They write profiles through profiles_admin_all, a
-- separate permissive policy, which is how Team and Recruiting set role_id.
-- The only self-service writes to a person's own row are full_name and
-- avatar_url (settings/page.tsx:87-89), and neither is pinned.

create or replace function private.current_role_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select role_id from public.profiles where id = auth.uid();
$$;

create or replace function private.current_team()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select team from public.profiles where id = auth.uid();
$$;

create or replace function private.current_reports_to()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select reports_to from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles_update_self" on public.profiles;

create policy "profiles_update_self" on public.profiles for update
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and role = (select private.current_role_name())
    and client_id is not distinct from (select private.current_client_id())
    and role_id is not distinct from (select private.current_role_id())
    and team is not distinct from (select private.current_team())
    and reports_to is not distinct from (select private.current_reports_to())
  );

-- ============================================================================
-- Verification — both of these were run against production
-- ============================================================================
--
-- 1. The escalation must be REJECTED, not silently no-op. Before this
--    migration it succeeded and staff_payments went 0 → 1 rows.
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims =
--        '{"sub":"<a non-admin profile id>","role":"authenticated"}';
--      update public.profiles
--        set role_id = (select id from public.roles where is_admin limit 1)
--        where id = '<the same id>';
--      rollback;
--
--    → ERROR: 42501: new row violates row-level security policy
--
-- 2. The control must still SUCCEED. This is the path Settings uses, and
--    breaking it would lock everyone out of editing their own name — which is
--    exactly what the recursive first draft of this migration did.
--
--      update public.profiles set full_name = '...', avatar_url = null
--        where id = '<the same id>';
--
--    → succeeded; staff_payments still 0 rows.
