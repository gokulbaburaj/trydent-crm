-- Progress on a manual goal becomes a log of contributions, not one number.
--
-- ============================================================================
-- Why
-- ============================================================================
--
-- `key_results.current_manual` was a single running total you overwrote. To
-- record ₹5,000 saved you had to read the old value, add it in your head, and
-- type the answer. Three things went wrong with that:
--
--   * The arithmetic was yours to get right, and a typo silently became the
--     truth with nothing to compare against.
--   * There was no history. "When did this move?" was unanswerable, so the
--     stalled check could only ask when the ROW last changed — which is not
--     the same question.
--   * A mistake was uncorrectable. You couldn't remove one bad increment
--     without recomputing everything after it.
--
-- Each row here is what was added, when, and a note. The current value is
-- their sum, so deleting a wrong entry self-corrects and the app does the
-- adding.
--
-- The note turns out to matter more than expected: on a "recruit 10 people"
-- goal the history becomes the list of who was hired, which is a record you'd
-- otherwise keep somewhere else entirely.
--
-- ============================================================================
-- What happens to current_manual
-- ============================================================================
--
-- It stays, and stops being written by the app. Two reasons not to drop it:
-- dropping a column is irreversible and this is a live database with no
-- staging, and keeping it means the seed below is verifiable afterwards —
-- sum(amount) should equal the old current_manual for every measure.
--
-- Auto-tracked measures (revenue_won and friends) never get contributions.
-- They read live data on every render; a log would be a second source of
-- truth for a number that already has one.
--
-- ============================================================================
-- Seeding
-- ============================================================================
--
-- Every manual measure with a non-zero value gets ONE entry carrying it,
-- dated `created_at` rather than today. Dating the seed today would claim
-- progress happened this morning that actually happened weeks ago, and the
-- pace and stalled logic both read these dates.

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  key_result_id uuid not null references public.key_results(id) on delete cascade,
  -- Signed on purpose. A correction ("that invoice bounced") is a negative
  -- entry, which keeps the log append-only and honest rather than editing
  -- history. Zero is pointless but harmless, so only null is refused.
  amount numeric not null,
  occurred_on date not null default current_date,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Every read is "all contributions for this measure, newest first".
create index if not exists goal_contributions_kr_idx
  on public.goal_contributions (key_result_id, occurred_on desc);

alter table public.goal_contributions enable row level security;

-- Same gate as key_results: whoever can manage goals can manage their
-- contributions. A separate policy here would be a permission the Settings
-- page can't see and nobody would remember to keep in step.
drop policy if exists "goal_contributions_manage" on public.goal_contributions;
create policy "goal_contributions_manage" on public.goal_contributions
  for all
  using ((select private.current_can('goals')))
  with check ((select private.current_can('goals')));

-- Seed. Guarded so a re-run can't double-count.
insert into public.goal_contributions (key_result_id, amount, occurred_on, note)
select k.id, k.current_manual, k.created_at::date, 'Starting value'
from public.key_results k
where k.source = 'manual'
  and k.current_manual <> 0
  and not exists (
    select 1 from public.goal_contributions c where c.key_result_id = k.id
  );

-- ============================================================================
-- Verification
-- ============================================================================
--
--   select k.name, k.current_manual,
--          coalesce(sum(c.amount), 0) as logged
--   from public.key_results k
--   left join public.goal_contributions c on c.key_result_id = k.id
--   where k.source = 'manual'
--   group by k.id, k.name, k.current_manual;
--
--   → logged must equal current_manual on every row. Any difference means the
--     seed missed something and the page would show a number that moved on
--     its own.
