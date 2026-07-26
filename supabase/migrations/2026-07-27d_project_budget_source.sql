-- Trydent Labs CRM — Budget from the deal, plus archiving
--
-- A project's money already exists in the pipeline: the deal you closed for
-- that client. Typing it a second time in Accounts is duplicate data entry that
-- immediately drifts. So a project can now LINK to a deal and inherit its value
-- and currency; `budget` is only read when there's no linked deal (one-off work
-- with no deal behind it).
--
-- `archived` hides finished work from Accounts and the Projects list without
-- deleting it — the money history stays intact.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.projects
  add column if not exists deal_id uuid references public.deals(id) on delete set null;
alter table public.projects
  add column if not exists archived boolean not null default false;

create index if not exists idx_projects_deal_id on public.projects(deal_id);

-- Best-effort backfill: if a client has exactly one deal, link its projects to
-- it. Ambiguous cases are left alone rather than guessed at.
update public.projects p
   set deal_id = d.id
  from public.deals d
 where p.deal_id is null
   and d.client_id = p.client_id
   and (
     select count(*) from public.deals d2 where d2.client_id = p.client_id
   ) = 1;
