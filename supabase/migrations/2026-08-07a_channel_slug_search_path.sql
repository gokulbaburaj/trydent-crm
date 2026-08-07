-- ============================================================================
-- private.channel_slug: pin the search_path
-- ============================================================================
--
-- Clears the last outstanding Supabase advisory,
-- `function_search_path_mutable`. This is hardening, not a live hole — the
-- function is NOT security definer (`prosecdef = false`), so it already runs
-- with the caller's own privileges and can't be used to escalate. Exploiting a
-- mutable search_path here would need someone able to CREATE a schema that
-- sorts ahead of pg_catalog and shadow a built-in, which is a bigger problem
-- than this function.
--
-- Safe to `create or replace`:
--   * nothing indexes it — checked pg_index and pg_constraint, both empty
--   * its only callers are private.team_channel() (a trigger) and the one-time
--     backfill, both in 2026-08-03c
--   * the body is unchanged; only the search_path attribute is added
--
-- `''` rather than the `public, pg_temp` its sibling trigger function uses:
-- this body touches nothing outside pg_catalog, which is always searched
-- implicitly and never needs qualifying. An empty search_path is the strictest
-- correct answer. (The sibling's `pg_temp` entry is worth a look one day — a
-- SECURITY DEFINER function with pg_temp in scope can be shadowed by a
-- caller-created temp object. It fully qualifies every reference today, so it
-- is fine in practice. Not touching it here; one function per migration.)

create or replace function private.channel_slug(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from
           regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
$$;


-- ============================================================================
-- Verify
-- ============================================================================
--   -- 1. The attribute is set.
--   select proname, proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'private' and p.proname = 'channel_slug';
--   -- expect: proconfig = {search_path=""}
--
--   -- 2. Behaviour is identical. These are the cases the team channels rely on.
--   select private.channel_slug('Video Editing') = 'video-editing'
--      and private.channel_slug('  Design  ')    = 'design'
--      and private.channel_slug('R&D / Ops')     = 'r-d-ops'
--      and private.channel_slug('')              = ''
--      and private.channel_slug(null)            = ''
--     as all_pass;
--   -- expect: all_pass = true
--
--   -- 3. Every team channel still matches its team's slug — i.e. the trigger
--   --    and the existing rows still agree.
--   select count(*) as mismatched
--   from public.channels c join public.teams t on t.id = c.team_id
--   where c.name <> private.channel_slug(t.name);
--   -- expect: 0
