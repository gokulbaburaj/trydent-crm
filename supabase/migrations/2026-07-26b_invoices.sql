-- Trydent Labs CRM — Invoices
-- Phase 2 of the portal roadmap. Invoices become the source of truth for what a
-- client owes; the portal's deal-derived payments summary is replaced by this.
-- `document_url` is a link (Drive etc.) for now; `storage_path` is reserved for
-- the upload work, same hedge as client_documents.
-- Run in the Supabase SQL editor AFTER 2026-07-26_client_documents.sql.
-- Safe to re-run.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  number text not null,
  amount numeric not null default 0,
  currency text not null default 'USD',
  -- draft is staff-only; sent/paid are client-visible. "overdue" is derived at
  -- read time from due_date rather than stored, so it can never go stale.
  status text not null default 'draft',
  issue_date date,
  due_date date,
  document_url text,
  storage_path text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_valid check (status in ('draft', 'sent', 'paid'))
);

create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_deal_id on public.invoices(deal_id);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;

drop policy if exists "invoices_staff_all" on public.invoices;
create policy "invoices_staff_all" on public.invoices for all
  using (public.current_role_name() in ('admin', 'rep'));

-- Clients never see drafts.
drop policy if exists "invoices_client_select" on public.invoices;
create policy "invoices_client_select" on public.invoices for select
  using (
    public.current_role_name() = 'client'
    and client_id = public.current_client_id()
    and status <> 'draft'
  );

-- Carry across anything already filed as an invoice-category document, so the
-- documents you added in Phase 1 don't need re-entering. Amounts start at 0 —
-- fill them in from the Invoices panel.
insert into public.invoices (client_id, number, amount, status, document_url, created_by, created_at)
select d.client_id, d.name, 0, 'sent', d.url, d.added_by, d.created_at
from public.client_documents d
where d.category = 'invoice'
  and d.url is not null
  and not exists (
    select 1 from public.invoices i
    where i.client_id = d.client_id and i.number = d.name
  );

delete from public.client_documents where category = 'invoice';
