-- Trydent Labs CRM — Project team members
--
-- `owner` stays as the single accountable lead. `member_ids` holds everyone
-- else working on the project, so a project can show a real team instead of
-- one name.
--
-- Same uuid[] shape as activities.attendee_ids — small lists, always read with
-- their parent row, no join table needed.
--
-- Existing owners are backfilled into the member list so nobody vanishes from
-- a project the moment this runs.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.projects add column if not exists member_ids uuid[] not null default '{}';

update public.projects
   set member_ids = array[owner]
 where owner is not null
   and not (owner = any(member_ids));
