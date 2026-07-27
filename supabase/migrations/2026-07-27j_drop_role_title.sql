-- Trydent Labs CRM — retire applicants.role_title
--
-- Background. Before the `roles` table existed, an applicant's role was free
-- text. 2026-07-27g added `applicants.role_id` but left `role_title` in place,
-- and the app wrote BOTH: role_id from the picker, role_title as a copy of the
-- role's name. The detail modal then let you edit role_title as free text.
--
-- So one applicant could be role_id → "Video Editor" and role_title → "video
-- guy". That isn't cosmetic: the role selects their onboarding checklist, so
-- the board could say one thing while the checklist did another.
--
-- The app now reads the role name through role_id only. This migration moves
-- any text-only applicants onto a real role, then drops the column.
--
-- Run in the Supabase SQL editor, AFTER deploying the matching code. Safe to
-- re-run. Run the two SELECTs at the bottom BEFORE the drop if you want to see
-- what would be lost.


-- ============================================================================
-- 1. Backfill role_id from role_title where we can match a real role
-- ============================================================================
-- Case-insensitive, whitespace-trimmed. Only fills gaps; an applicant who
-- already has a role_id keeps it, because the picker is the better source.

update public.applicants a
set role_id = r.id
from public.roles r
where a.role_id is null
  and a.role_title is not null
  and lower(btrim(a.role_title)) = lower(btrim(r.name));


-- ============================================================================
-- 2. Anything left over
-- ============================================================================
-- An applicant whose role_title matched no role. Rather than invent a role or
-- silently drop the text, park it in `notes` so the information survives and a
-- human can act on it.

update public.applicants
set notes = concat_ws(
      E'\n',
      nullif(btrim(coalesce(notes, '')), ''),
      'Role (unmatched on migration): ' || role_title
    )
where role_id is null
  and nullif(btrim(coalesce(role_title, '')), '') is not null;


-- ============================================================================
-- 3. Drop it
-- ============================================================================

alter table public.applicants drop column if exists role_title;


-- ============================================================================
-- Pre-flight checks — run these on their own BEFORE the statements above
-- ============================================================================
--
-- Which applicants would be auto-matched:
--
--   select a.full_name, a.role_title, r.name as will_link_to
--   from public.applicants a
--   join public.roles r
--     on lower(btrim(a.role_title)) = lower(btrim(r.name))
--   where a.role_id is null;
--
-- Which have text that matches no role (these get parked in notes):
--
--   select full_name, role_title
--   from public.applicants
--   where role_id is null
--     and nullif(btrim(coalesce(role_title, '')), '') is not null
--     and lower(btrim(role_title)) not in (select lower(btrim(name)) from public.roles);
--
-- If the second query returns people you care about, add the missing roles in
-- Settings first and re-run this migration — it's idempotent, and the backfill
-- will then match them properly instead of dumping text into notes.
