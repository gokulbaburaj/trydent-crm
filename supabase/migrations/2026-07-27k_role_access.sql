-- Trydent Labs CRM — access levels attached to company roles
--
-- The problem this solves
-- -----------------------
-- Access has been decided by `profiles.role`, which has four values:
-- admin, rep, contractor, client. An employee is therefore either a `rep`
-- (sees clients, pipeline, revenue, the lot) or a `contractor` (sees a portal
-- and nothing else). There is no middle, so a video editor who needs the
-- projects board has to be given the whole company.
--
-- Meanwhile `roles` — Video Editor, Designer, Project Manager — already exists
-- and already decides teams and onboarding checklists. Access belongs there
-- too: one list, one place to change it.
--
-- What this does NOT change
-- -------------------------
-- `profiles.role` stays, and stays authoritative for the three things that are
-- about *kind of account* rather than job:
--
--   client     → portal only, never staff pages. Untouched.
--   contractor → still restricted; a role can now grant them a little more.
--   admin      → still bypasses everything.
--
-- A role's page list is additive on top of that floor. It cannot be used to
-- promote someone to admin — that's `roles.is_admin`, which only an existing
-- admin can set, and which is deliberately separate from the page list so
-- ticking boxes can never accidentally hand over the keys.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Columns
-- ============================================================================

alter table public.roles
  -- Page keys, matching PageKey in src/lib/permissions.ts. text[] rather than a
  -- join table: the list is short, always read whole, and never queried by page.
  add column if not exists pages text[] not null default '{}'::text[];

alter table public.roles
  -- Kept apart from `pages` on purpose. Admin isn't "all the pages" — it's the
  -- right to change roles, see pay, and manage logins.
  add column if not exists is_admin boolean not null default false;

comment on column public.roles.pages is
  'Page keys this role may open, additive on top of the account-type floor set '
  'by profiles.role. Mirrors PageKey in src/lib/permissions.ts.';


-- ============================================================================
-- 2. Sensible starting grants
-- ============================================================================
-- Only fills roles that have never been configured (empty array), so re-running
-- this never stomps choices made in Settings.
--
-- Matched on name because that's all we know about an org we haven't seen.
-- Everything unmatched gets the baseline: their own work, the projects they're
-- on, the calendar. Widen from Settings.

update public.roles
set pages = case
  when name ilike '%admin%' or name ilike '%founder%' or name ilike '%owner%' then
    array['my-work','dashboard','clients','pipeline','projects','schedule',
          'organization','accounts','goals','recruiting','onboarding','team','settings']
  when name ilike '%project manager%' or name ilike '%producer%' or name ilike '%lead%' then
    array['my-work','dashboard','clients','projects','schedule','organization',
          'goals','team','settings']
  when name ilike '%sales%' or name ilike '%account%' or name ilike '%growth%' then
    array['my-work','dashboard','clients','pipeline','projects','schedule','settings']
  else
    array['my-work','projects','schedule','settings']
end
where pages = '{}'::text[];

-- If a role is literally named for running the company, give it the flag too.
update public.roles
set is_admin = true
where is_admin = false
  and (name ilike '%founder%' or name ilike '%owner%');


-- ============================================================================
-- 3. Helpers
-- ============================================================================
-- SECURITY DEFINER because they read `profiles` and `roles` on behalf of a user
-- whose own RLS forbids reading other people's rows. search_path is pinned —
-- an unpinned definer function is a privilege-escalation path.

create or replace function public.current_pages()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(r.pages, '{}'::text[])
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

/** True if the signed-in user may reach `page`.
 *
 *  admin  → always. The account type outranks any role list.
 *  client → never. Portal accounts have no business on staff pages whatever
 *           role_id happens to be set on them.
 *  else   → whatever their role grants.
 */
create or replace function public.current_can(page text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.current_role_name() = 'admin' then true
    when public.current_role_name() = 'client' then false
    else page = any(coalesce(public.current_pages(), '{}'::text[]))
  end;
$$;

/** Admin by account type OR by role flag. This is the check for the genuinely
 *  privileged actions: seeing pay, editing roles, managing logins. */
create or replace function public.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role_name() = 'admin'
      or coalesce(
           (select r.is_admin
            from public.profiles p
            join public.roles r on r.id = p.role_id
            where p.id = auth.uid()),
           false
         );
$$;

grant execute on function public.current_pages() to authenticated;
grant execute on function public.current_can(text) to authenticated;
grant execute on function public.current_is_admin() to authenticated;


-- ============================================================================
-- 4. Only admins may hand out access
-- ============================================================================
-- roles_admin_write already restricted writes to profiles.role = 'admin'.
-- Widen it to the flag as well, so a role marked is_admin can also manage the
-- list — otherwise you'd have exactly one person who can ever change anything.

drop policy if exists "roles_admin_write" on public.roles;
create policy "roles_admin_write" on public.roles for all
  using (public.current_is_admin())
  with check (public.current_is_admin());


-- ============================================================================
-- Check what you just granted
-- ============================================================================
--
--   select name, team, is_admin, pages from public.roles order by name;
--
-- And who lands where:
--
--   select p.full_name, p.role as account_type, r.name as job_role, r.pages
--   from public.profiles p
--   left join public.roles r on r.id = p.role_id
--   where p.role <> 'client'
--   order by p.full_name;
