-- Give every money column a scale.
--
-- Applied live 2026-07-31; this file exists so the repo matches the database.
--
-- `deals.deal_value` and `deals.paid` were already numeric(12,2). Every other
-- money column was bare `numeric`, which accepts unlimited scale. So an invoice
-- could hold 1234.5678 while the same figure entered against a deal rounded to
-- 1234.57 — the inconsistency is the bug, because two parts of the app then
-- disagree about the same number and the portal renders whichever it happens
-- to read.
--
-- 12 digits with 2 decimal places tops out at 9,999,999,999.99, which is
-- comfortably beyond any invoice this company will raise in any currency it
-- bills in.

alter table public.invoices            alter column amount set data type numeric(12,2);
alter table public.projects            alter column budget set data type numeric(12,2);
alter table public.project_allocations alter column amount set data type numeric(12,2);
alter table public.staff_payments      alter column amount set data type numeric(12,2);

-- Deliberately left bare: these are not money.
--   key_results.target, key_results.current_manual — a KR target of 0.5 is
--     legitimate, and forcing 2dp would quietly round somebody's metric.
--   project_allocations.percent — a share, not an amount.
