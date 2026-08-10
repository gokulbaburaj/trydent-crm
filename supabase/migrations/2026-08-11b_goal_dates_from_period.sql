-- Make each goal's dates agree with its own period label.
--
-- ============================================================================
-- What was wrong
-- ============================================================================
--
-- `period`, `start_date` and `end_date` were three independent hand-entered
-- fields describing one fact, so they drifted. State on 11 Aug 2026:
--
--   Earn 1 Lakhs           2026 Q3   17 Jul → 26 Sep   (a fortnight off)
--   TEAM                   2026 Q3   5 Aug  → 31 Aug   (a month, not a quarter)
--   Save for new Computer  2027 Q4   1 Aug 2026 → 30 Dec 2027   (17 months)
--
-- Pace is computed from the window, so every one of these produced a different
-- answer depending on which field you believed. The page now derives dates
-- from the period; this makes the stored columns match what it derives, so a
-- query and the UI can't disagree.
--
-- ============================================================================
-- The one that isn't mechanical
-- ============================================================================
--
-- "Save for new Computer" is labelled 2027 Q4 and spans seventeen months.
-- Those are two different goals and no rule can pick between them:
--
--   * If the label is right, it runs Oct–Dec 2027 and hasn't started.
--   * If the dates are right, it's a long-running savings goal and the
--     quarter label was never accurate.
--
-- Guessing would silently discard whichever the person meant. It is left
-- ALONE by this migration and re-labelled as a custom range, which is the one
-- statement that's true either way — it preserves the dates exactly and stops
-- the label claiming a quarter it doesn't occupy. Gokul can set it to a real
-- quarter from the UI in two clicks if that's what he wants.
--
-- ============================================================================
-- Guard
-- ============================================================================
--
-- Raises rather than proceeding if the table doesn't look like it did when
-- this was written. A migration that rewrites dates across a table it doesn't
-- recognise is how you lose data quietly.

do $$
declare
  n int;
begin
  select count(*) into n from public.goals;
  if n > 20 then
    raise exception 'Expected a handful of goals, found %. Review before running.', n;
  end if;
end $$;

-- Quarters: derive both bounds from the label. Only touches rows whose period
-- actually parses as "YYYY Qn" AND whose dates currently disagree, so it's
-- idempotent and skips the custom-range case entirely.
update public.goals g
set
  start_date = make_date(
    (substring(g.period from '^(\d{4})'))::int,
    (substring(g.period from 'Q([1-4])$'))::int * 3 - 2,
    1
  ),
  end_date = (
    make_date(
      (substring(g.period from '^(\d{4})'))::int,
      (substring(g.period from 'Q([1-4])$'))::int * 3 - 2,
      1
    ) + interval '3 months - 1 day'
  )::date
where g.period ~ '^\d{4} Q[1-4]$'
  and g.objective <> 'Save for new Computer'
  and (
    g.start_date is distinct from make_date(
      (substring(g.period from '^(\d{4})'))::int,
      (substring(g.period from 'Q([1-4])$'))::int * 3 - 2, 1)
    or g.end_date is distinct from (make_date(
      (substring(g.period from '^(\d{4})'))::int,
      (substring(g.period from 'Q([1-4])$'))::int * 3 - 2, 1)
      + interval '3 months - 1 day')::date
  );

-- The ambiguous one: keep the dates, drop the false quarter claim. The label
-- shape matches parsePeriod's `custom` variant in lib/goalPeriod.ts.
update public.goals
set period = to_char(start_date, 'YYYY-MM-DD') || ' to ' || to_char(end_date, 'YYYY-MM-DD')
where objective = 'Save for new Computer'
  and period = '2027 Q4'
  and start_date is not null
  and end_date is not null;

-- ============================================================================
-- Verification
-- ============================================================================
--
--   select objective, period, start_date, end_date from public.goals;
--
--   2026 Q3 rows → 2026-07-01 to 2026-09-30
--   Save for new Computer → period reads "2026-08-01 to 2027-12-30",
--     dates unchanged
