-- Regenerate schema.sql from the live database.
--
-- schema.sql drifted about fifteen tables behind production because every
-- change went in as a migration and nobody replayed them into the snapshot.
-- Run this against the live database (Supabase SQL editor is fine — it's
-- read-only) and paste each section into schema.sql in the order below.
--
-- Sections, in dependency order:
--   1. enums          2. tables       3. constraints
--   4. indexes        5. views        6. functions
--   7. triggers       8. RLS + policies
--
-- Nothing here writes. It reads the catalog and prints DDL.

-- ── 1. enums ─────────────────────────────────────────────────────────────
select 'create type public.' || t.typname || ' as enum ('
       || string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
       || ');' as ddl
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace and n.nspname = 'public'
group by t.typname
order by t.typname;

-- ── 2. tables ────────────────────────────────────────────────────────────
with cols as (
  select c.relname tbl,
    string_agg('  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
      || case when a.attnotnull then ' not null' else '' end
      || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''),
      E',\n' order by a.attnum) body
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where c.relkind = 'r'
  group by c.relname
)
select 'create table if not exists public.' || tbl || E' (\n' || body || E'\n);' as ddl
from cols order by tbl;

-- ── 3. constraints ───────────────────────────────────────────────────────
-- Primary keys and uniques first, then checks, then foreign keys — a foreign
-- key can't be added before the table it points at has its key.
select 'alter table public.' || conrelid::regclass::text
       || ' add constraint ' || quote_ident(conname) || ' '
       || pg_get_constraintdef(oid) || ';' as ddl
from pg_constraint
where connamespace = 'public'::regnamespace
order by array_position(array['p','u','c','f']::"char"[], contype),
         conrelid::regclass::text, conname;

-- ── 4. indexes ───────────────────────────────────────────────────────────
-- Constraint-backed indexes are excluded; they arrive with the constraint.
select indexdef || ';' as ddl
from pg_indexes
where schemaname = 'public'
  and indexname not in (
    select conname from pg_constraint where connamespace = 'public'::regnamespace
  )
order by tablename, indexname;

-- ── 5. views ─────────────────────────────────────────────────────────────
select 'create or replace view public.' || viewname
       || E' with (security_invoker = true) as\n' || definition as ddl
from pg_views where schemaname = 'public' order by viewname;

-- ── 6. functions ─────────────────────────────────────────────────────────
-- Extension-owned functions are excluded — they belong to the extension, and
-- running ALTER on one aborts the whole script.
select pg_get_functiondef(p.oid) || ';' as ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by p.proname;

-- ── 7. triggers ──────────────────────────────────────────────────────────
select pg_get_triggerdef(oid) || ';' as ddl
from pg_trigger
where not tgisinternal
  and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
order by tgrelid::regclass::text, tgname;

-- ── 8. RLS and policies ──────────────────────────────────────────────────
select 'alter table public.' || c.relname || ' enable row level security;' as ddl
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r' and c.relrowsecurity
order by c.relname;

select 'create policy ' || quote_ident(policyname) || ' on public.' || tablename
       || ' as ' || lower(permissive)
       || ' for ' || lower(cmd)
       || ' to ' || array_to_string(roles, ', ')
       || coalesce(E'\n  using (' || qual || ')', '')
       || coalesce(E'\n  with check (' || with_check || ')', '')
       || ';' as ddl
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ── grants worth checking by hand ────────────────────────────────────────
-- Trigger functions and internal helpers should NOT be callable over
-- PostgREST. Anything listed here is reachable at /rest/v1/rpc/<name> by the
-- role shown, which for `anon` means without logging in at all.
select p.proname, r.rolname as granted_to
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
cross join lateral (values ('anon'), ('authenticated')) as g(rolname)
join pg_roles r on r.rolname = g.rolname
where has_function_privilege(r.oid, p.oid, 'EXECUTE')
  and p.prokind = 'f'
order by p.proname, r.rolname;
