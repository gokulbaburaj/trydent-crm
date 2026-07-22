-- Trydent Labs CRM — Team hierarchy (teams + reporting)
-- Run in the Supabase SQL editor (safe to re-run).
-- The "destructive operation" warning is expected — click Run anyway.

alter table public.profiles
  add column if not exists team text,
  add column if not exists reports_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_profiles_reports_to on public.profiles(reports_to);
