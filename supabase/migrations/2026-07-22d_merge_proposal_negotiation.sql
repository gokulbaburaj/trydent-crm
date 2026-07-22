-- Trydent Labs CRM — Merge the "Negotiation" pipeline stage into "Proposal"
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Note: Postgres can't drop a value from an enum in use, so 'Negotiation'
-- stays defined on the deal_stage type but is no longer produced by the app
-- (it's removed from DEAL_STAGES in src/lib/types.ts). This just moves any
-- existing rows over.

update public.deals
set deal_stage = 'Proposal'
where deal_stage = 'Negotiation';
