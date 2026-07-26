-- Trydent Labs CRM — Percentage-based allocations
--
-- Agency work is usually split as a share of the fee ("editor takes 30%"),
-- not a fixed number. When `percent` is set the money is DERIVED from the
-- project budget, so raising the deal value automatically raises everyone's
-- cut instead of silently leaving stale figures behind.
--
-- `amount` remains for fixed-fee lines. Exactly one of the two is used per
-- row: percent wins when present.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.project_allocations
  add column if not exists percent numeric;

comment on column public.project_allocations.percent is
  'Share of the project budget, 0-100. When set, `amount` is ignored and the payout is computed from the budget.';
