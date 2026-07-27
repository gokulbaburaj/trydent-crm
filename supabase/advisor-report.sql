-- Trydent Labs CRM — reproduce the Supabase advisor findings as text.
--
-- Paste the whole thing into the Supabase SQL editor and run it. Then use the
-- "Copy" / "Export → Markdown" button above the results grid and paste that
-- back to me. This is not a migration — it changes nothing, it only reads the
-- catalog.
--
-- It covers the seven checks Supabase's linter runs against public schemas.
-- The advisor UI shows a title and a table name; this shows the actual policy
-- expression, which is what's needed to decide whether a warning matters.

with
-- Expand `FOR ALL` into the four actions it really covers, so overlapping
-- policies are counted the way Postgres evaluates them.
policy_actions as (
  select
    p.tablename,
    p.policyname,
    p.roles::text as roles,
    a.action,
    p.qual,
    p.with_check
  from pg_policies p
  cross join lateral (
    select unnest(
      case when p.cmd = 'ALL'
           then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
           else array[p.cmd]
      end
    ) as action
  ) a
  where p.schemaname = 'public'
    and p.permissive = 'PERMISSIVE'
),

-- 1. Multiple permissive policies for the same table+action+role.
--    Postgres ORs these together, so the most permissive one wins. This is the
--    exact shape of the activities leak: adding a tighter policy beside a
--    looser one changes nothing.
multiple_permissive as (
  select
    '1_multiple_permissive_policies' as category,
    format('%s [%s] — %s policies OR''d together: %s',
           tablename, action, count(*),
           string_agg(policyname, ', ' order by policyname)) as detail
  from policy_actions
  group by tablename, action, roles
  having count(*) > 1
),

-- 2. auth.<fn>() called per row instead of hoisted into an InitPlan.
--    A wrapped call renders as "( SELECT auth.uid() AS uid)", so anything
--    still matching the bare form has not been fixed.
rls_initplan as (
  select distinct
    '2_auth_rls_initplan' as category,
    format('%s.%s — %s',
           tablename, policyname,
           coalesce(qual, '') || coalesce(' [check] ' || with_check, '')) as detail
  from policy_actions
  where (
      coalesce(qual, '') ~ 'auth\.(uid|jwt|role)\(\)'
      or coalesce(with_check, '') ~ 'auth\.(uid|jwt|role)\(\)'
      or coalesce(qual, '') ~ 'current_setting\('
    )
    and coalesce(qual, '') !~ '\(\s*SELECT\s+auth\.'
    and coalesce(with_check, '') !~ '\(\s*SELECT\s+auth\.'
),

-- 3. Tables in public with RLS switched off entirely. Anything reachable
--    through PostgREST with RLS off is world-readable to any signed-in user.
rls_disabled as (
  select
    '3_rls_disabled' as category,
    format('%s — RLS is NOT enabled', c.relname) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
),

-- 4. RLS enabled but no policies at all — the table is fully locked, which is
--    safe but usually means something is quietly broken in the app.
rls_no_policy as (
  select
    '4_rls_enabled_no_policy' as category,
    format('%s — RLS on, zero policies (nothing can read it)', c.relname) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (
      select 1 from pg_policy pol where pol.polrelid = c.oid
    )
),

-- 5. Views that run as their creator rather than the querying user.
security_definer_views as (
  select
    '5_security_definer_view' as category,
    format('%s — %s', c.relname,
           case when obj_description(c.oid, 'pg_class') is not null
                then 'documented: ' || left(obj_description(c.oid, 'pg_class'), 120)
                else 'UNDOCUMENTED — decide and record why'
           end) as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%'
    and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=on%'
),

-- 6. SECURITY DEFINER functions with an unpinned search_path — the real
--    privilege-escalation risk in this list.
mutable_search_path as (
  select
    '6_function_search_path_mutable' as category,
    format('%s — %s', p.oid::regprocedure,
           case when p.prosecdef then 'SECURITY DEFINER (fix this one)' else 'invoker' end) as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      where cfg like 'search_path=%'
    )
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
    )
),

-- 7. Foreign keys with no supporting index. Every join and every cascading
--    delete across one of these is a sequential scan.
unindexed_fks as (
  select
    '7_unindexed_foreign_key' as category,
    format('%s.%s (%s)',
           c.conrelid::regclass, c.conname,
           (select string_agg(a.attname, ', ' order by k.ord)
            from unnest(c.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)) as detail
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  where c.contype = 'f'
    and n.nspname = 'public'
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = c.conrelid
        -- the FK columns must be a leading prefix of the index
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
    )
)

select category, detail from multiple_permissive
union all select category, detail from rls_initplan
union all select category, detail from rls_disabled
union all select category, detail from rls_no_policy
union all select category, detail from security_definer_views
union all select category, detail from mutable_search_path
union all select category, detail from unindexed_fks
order by category, detail;
