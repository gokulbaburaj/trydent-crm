-- Trydent Labs CRM — optional times on scheduled work
--
-- Safe to re-run. No data is rewritten.
--
-- Why a separate nullable time column, not timestamptz
-- ----------------------------------------------------
-- The obvious move is `alter column due_date type timestamptz`. It's wrong
-- twice over.
--
-- 1. It invents data. Every existing row would be stamped with a time nobody
--    chose — midnight in whichever timezone the server assumed. Sixteen tasks
--    would silently acquire a 00:00 deadline, and the Schedule grid would pile
--    them all at the top of the day as though that meant something.
--
-- 2. It destroys a real state. "Due Friday" and "due Friday at 3pm" are
--    different facts. A timestamp can't express the first one — it can only
--    fake it with a sentinel hour, which every reader then has to know to
--    ignore. Calendars have always modelled this as all-day versus timed, and
--    that distinction is the feature, not an omission.
--
-- So the date stays authoritative and the time is an optional refinement:
-- null means all-day, a value means place it exactly there.
--
-- Timezone: `time without time zone` deliberately. This is a small agency in
-- one place, and "3pm" means 3pm to everyone reading it. Storing an offset
-- would make a task shift on screen because someone opened it from a different
-- country, which is worse than the problem it solves. Revisit if the team ever
-- spans timezones — at which point the project's timezone, not the viewer's,
-- is the thing to store.


-- ============================================================================
-- 1. Tasks — the things that actually land in a calendar
-- ============================================================================

alter table public.project_tasks
  add column if not exists due_time time;

-- End time is optional on top of an optional start: a task can be a moment
-- ("3pm standup") or a block ("2pm–4pm edit"). Null end means a moment.
alter table public.project_tasks
  add column if not exists end_time time;

-- A block that ends before it starts is a typo, not a schedule.
alter table public.project_tasks
  drop constraint if exists project_tasks_time_order;
alter table public.project_tasks
  add constraint project_tasks_time_order
  check (due_time is null or end_time is null or end_time > due_time);

-- An end time without a start has nothing to anchor to.
alter table public.project_tasks
  drop constraint if exists project_tasks_end_needs_start;
alter table public.project_tasks
  add constraint project_tasks_end_needs_start
  check (end_time is null or due_time is not null);


-- ============================================================================
-- 2. Meeting requests
-- ============================================================================
-- A client asking for a call at no particular time is the norm, so this stays
-- optional too — but it's the field most likely to be filled in.

alter table public.meeting_requests
  add column if not exists preferred_time time;


-- ============================================================================
-- 3. Projects — deliberately untouched
-- ============================================================================
-- `projects.start_date` and `projects.due_date` stay dates. A project is a
-- range measured in weeks; "the website launch starts at 2:15pm" is not a
-- thing anyone needs, and adding the field would only invite it to be filled
-- in with noise that then has to be rendered somewhere.
--
-- Same for `deals.close_date` and the goal dates: milestones, not appointments.


-- ============================================================================
-- Verify
-- ============================================================================
--   select column_name, data_type from information_schema.columns
--    where table_name='project_tasks' and column_name in ('due_date','due_time','end_time');
--
--   -- constraint holds:
--   -- insert ... (due_time '15:00', end_time '14:00') should fail
