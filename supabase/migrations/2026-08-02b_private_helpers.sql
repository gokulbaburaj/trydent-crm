-- Trydent Labs CRM — move RLS helpers out of the exposed API schema
--
-- Audit Finding 2. Closes the remaining advisor warnings.
--
-- The problem
-- -----------
-- PostgREST exposes the `public` schema, so every SECURITY DEFINER helper is
-- reachable at /rest/v1/rpc/<name> by any signed-in user — and `current_role_id`
-- and `touch_resource` by `anon`, without signing in at all. They leak no data
-- on their own (each is scoped to auth.uid()), but they are API surface nobody
-- asked for, and `touch_resource` is a trigger function that has no business
-- being callable by anyone.
--
-- TWO CORRECTIONS TO EARLIER ADVICE, both mine
-- --------------------------------------------
-- 1. I said this rewrites all 59 policies and is medium-high risk. **Wrong.**
--    Postgres stores a policy expression as a parsed tree of OIDs, not as text.
--    Moving a function's schema updates every policy that references it, for
--    free. Verified before writing this, with a throwaway function, table and
--    policy in a rolled-back transaction:
--
--      before:  public._probe_fn()
--      after:   _probe._probe_fn()      -- after ALTER FUNCTION ... SET SCHEMA
--
--    So there is no policy rewrite here at all. Eight ALTER statements.
--
-- 2. I also said revoking EXECUTE was the alternative and that it breaks
--    everything. That part stands, and it's why this migration does NOT revoke
--    EXECUTE from the helpers. A policy expression is evaluated with the
--    CALLER's privileges, so the caller still needs USAGE on the schema and
--    EXECUTE on the function. The security win is not a privilege change —
--    it's that PostgREST only exposes `public`, so a function in `private`
--    is simply not routable. Different mechanism, same outcome, no lockout.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. The schema
-- ============================================================================

create schema if not exists private;

comment on schema private is
  'Server-side helpers called by RLS policies and triggers. Not exposed by '
  'PostgREST, so nothing here is reachable at /rest/v1/rpc.';

-- Callers still need to reach these during policy evaluation — see correction
-- 2 above. Both roles, because an anon request against an RLS-protected table
-- still evaluates the policy.
grant usage on schema private to anon, authenticated, service_role;


-- ============================================================================
-- 2. Move the helpers
-- ============================================================================
-- Wrapped in a DO so re-running is a no-op rather than an error.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'current_can(text)',
    'current_pages()',
    'current_role_name()',
    'current_client_id()',
    'current_is_admin()',
    'current_role_id()',
    'has_task_in_project(uuid)',
    'is_project_member(uuid)',
    -- A trigger function. Triggers run as the definer regardless of who fired
    -- them, so nobody needs to be able to call this by name.
    'touch_resource()'
  ] loop
    if to_regprocedure('public.' || fn) is not null then
      execute format('alter function public.%s set schema private', fn);
      raise notice 'moved public.% -> private', fn;
    end if;
  end loop;
end$$;


-- ============================================================================
-- 3. Repair the two helpers that call other helpers
-- ============================================================================
-- `current_can` and `current_is_admin` reference their dependencies as
-- `public.current_role_name()` and `public.current_pages()` — schema-qualified,
-- which was correct until five statements ago and is now a dangling reference.
--
-- These are LANGUAGE sql with string bodies, so the reference resolves at
-- execution rather than at creation: nothing errors when the schema moves, and
-- the first policy check after this migration would fail instead. That's the
-- trap in this change, and it's why these two are recreated rather than moved
-- and forgotten.

create or replace function private.current_can(page text)
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp' as $$
  select case
    when private.current_role_name() = 'admin' then true
    when private.current_role_name() = 'client' then false
    else page = any(coalesce(private.current_pages(), '{}'::text[]))
  end;
$$;

create or replace function private.current_is_admin()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp' as $$
  select private.current_role_name() = 'admin'
      or coalesce(
           (select r.is_admin
            from public.profiles p
            join public.roles r on r.id = p.role_id
            where p.id = auth.uid()),
           false
         );
$$;


-- ============================================================================
-- 4. Trigger function: nobody calls it by name
-- ============================================================================

revoke all on function private.touch_resource() from public, anon, authenticated;


-- ============================================================================
-- 5. What deliberately stays in `public`
-- ============================================================================
-- `approve_task` and `touch_portal` — the client portal calls them on purpose,
-- over the API, and both scope their own writes to current_client_id(). Moving
-- them would break the portal. `approve_task` will therefore still appear in
-- the advisor output, and that is the correct outcome, not an oversight.


-- ============================================================================
-- Verify
-- ============================================================================
--   -- 1. Nothing left behind, and policies followed the move.
--   select count(*) filter (where qual ~ 'private\.') as private_refs,
--          count(*) filter (where qual ~ '\ypublic\.current_') as stale_public_refs
--   from pg_policies where schemaname='public';
--   -- expect: private_refs > 0, stale_public_refs = 0
--
--   -- 2. The helpers are gone from the exposed schema.
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname like 'current_%';
--   -- expect: 0 rows
--
--   -- 3. Behaviour is unchanged. Swap in a real non-admin profile id.
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<non-admin-profile-uuid>"}';
--     select count(*) from public.clients;    -- their normal visibility
--     select count(*) from public.resources;
--   rollback;
--
-- Then sign in as yourself, as a non-admin, and open a client portal. This is a
-- namespace change, not a rule change — anything visibly different is a bug.
