-- Trydent Labs CRM — Client documents (proposals, contracts, invoices, assets)
-- Phase 1 of the portal roadmap. Ships as link-only: `url` points at Drive or
-- anywhere else. `storage_path` is reserved for Phase 2, when uploads move into
-- a Supabase Storage bucket — no migration needed then, just start filling it.
-- Run in the Supabase SQL editor (safe to re-run).

create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  name text not null,
  category text not null default 'other',
  url text,
  storage_path text,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_documents_has_location check (url is not null or storage_path is not null)
);

create index if not exists idx_client_documents_client_id on public.client_documents(client_id);
create index if not exists idx_client_documents_project_id on public.client_documents(project_id);

alter table public.client_documents enable row level security;

drop policy if exists "client_documents_staff_all" on public.client_documents;
create policy "client_documents_staff_all" on public.client_documents for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "client_documents_client_select" on public.client_documents;
create policy "client_documents_client_select" on public.client_documents for select
  using (
    public.current_role_name() = 'client'
    and client_id = public.current_client_id()
  );
