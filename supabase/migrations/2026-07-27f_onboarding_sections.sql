-- Trydent Labs CRM — Onboarding sections, properties and welcome note
--
-- A flat checklist doesn't say WHEN something happens. Grouping steps into
-- phases ("Before first day", "First day", "First week") is what makes an
-- onboarding doc usable — you read the section you're in, not the whole list.
--
-- `section` is free text rather than an enum so you can invent phases per
-- template without a migration.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.onboarding_template_items
  add column if not exists section text not null default 'Before first day';
alter table public.onboarding_tasks
  add column if not exists section text not null default 'Before first day';

-- A short note that heads every checklist made from this template.
alter table public.onboarding_templates
  add column if not exists welcome_note text;

-- Properties shown on a person's onboarding page.
alter table public.profiles add column if not exists title text;
alter table public.profiles add column if not exists start_date date;
