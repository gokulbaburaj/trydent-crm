-- Trydent Labs CRM — the staff portal becomes a page grant
--
-- 2026-07-27n added profiles.portal_only. An hour of use showed why that was
-- wrong: it's a second dial that silently overrides the first. Grant the HR
-- role Recruiting, then mark that person portal-only, and their grants are
-- ignored with nothing on screen to say so.
--
-- So the portal becomes a page like any other. A role granted `staff-portal`
-- and nothing else IS the portal-only case — derived, not stored, so there's
-- no second thing to keep in sync and nothing that can disagree.
--
-- Run AFTER 2026-07-27n. Safe to re-run.


-- ============================================================================
-- 1. A role for people who only get the portal
-- ============================================================================

insert into public.roles (name, team, pages, sort_order)
select 'Freelancer', null, array['staff-portal'], coalesce(max(sort_order), 0) + 1
from public.roles
where not exists (select 1 from public.roles where name = 'Freelancer');


-- ============================================================================
-- 2. Move anyone currently portal-only onto it
-- ============================================================================
-- Only people who have no job role yet, so this can't overwrite a considered
-- choice — someone you've already put on Video Editing stays there and simply
-- gains the full app, which is what marking them Full app would have done.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'portal_only'
  ) then
    execute $sql$
      update public.profiles p
      set role_id = (select id from public.roles where name = 'Freelancer')
      where p.portal_only = true
        and p.role_id is null
    $sql$;
  end if;
end $$;


-- ============================================================================
-- 3. Stop storing the always-granted pages
-- ============================================================================
-- 'my-work' and 'settings' are handed to every staff member by the app's
-- account floor. Storing them too meant a Freelancer role could never be
-- recognised as portal-only, because its page list was never just
-- ['staff-portal'].

update public.roles
set pages = array_remove(array_remove(pages, 'my-work'), 'settings')
where 'my-work' = any(pages) or 'settings' = any(pages);


-- ============================================================================
-- 4. Drop the toggle
-- ============================================================================

alter table public.profiles drop column if exists portal_only;


-- ============================================================================
-- Check
-- ============================================================================
--
--   select name, pages, is_admin from public.roles order by sort_order;
--
-- A role showing exactly {staff-portal} is a portal-only role. Everything else
-- lands in the full app with the pages listed.
