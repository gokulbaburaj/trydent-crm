-- Trydent Labs CRM — Per-deal currency
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Each deal now records the currency it's transacted in, so amounts convert
-- honestly instead of just swapping the symbol. deal_value and paid are stored
-- in THIS currency; the display toggle converts from it at live rates.

alter table public.deals
  add column if not exists currency text not null default 'USD';

-- Existing deals were all entered under the single app base currency, so
-- stamp them with it. New deals pick their own currency in the deal form.
update public.deals
set currency = coalesce((select base_currency from public.app_settings limit 1), 'USD');
