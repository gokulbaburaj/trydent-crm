-- Trydent Labs CRM — Task labels (e.g. "UI design", "Copywriting")
-- Run in the Supabase SQL editor (safe to re-run).

alter table public.project_tasks add column if not exists label text;
