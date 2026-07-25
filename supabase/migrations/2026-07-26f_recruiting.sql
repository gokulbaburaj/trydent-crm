-- Trydent Labs CRM — Recruiting and onboarding
-- Phase 7, the last of the roadmap. Mirrors the Applicant Tracker and New Hire
-- Onboarding databases from the old Notion company dashboard.
--
-- Onboarding is modelled as template → instance. Editing a template never
-- touches a hire already partway through their checklist, which is the whole
-- point of separating the two.
--
-- Staff-only throughout. Run in the Supabase SQL editor. Safe to re-run.

-- ============ APPLICANTS ============

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  role_title text,
  location text,
  stage text not null default 'applied',
  source text,
  resume_url text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applicants_stage_valid
    check (stage in ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected'))
);

create index if not exists idx_applicants_stage on public.applicants(stage);

drop trigger if exists applicants_set_updated_at on public.applicants;
create trigger applicants_set_updated_at before update on public.applicants
  for each row execute function public.set_updated_at();

-- ============ ONBOARDING ============

create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create index if not exists idx_onboarding_template_items_template
  on public.onboarding_template_items(template_id);

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_onboarding_tasks_profile on public.onboarding_tasks(profile_id);

-- Only one default template. Flipping a new one clears the old.
create or replace function public.enforce_single_default_template()
returns trigger
set search_path = public
as $$
begin
  if new.is_default then
    update public.onboarding_templates
      set is_default = false
      where id <> new.id and is_default;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists onboarding_template_single_default on public.onboarding_templates;
create trigger onboarding_template_single_default after insert or update on public.onboarding_templates
  for each row execute function public.enforce_single_default_template();

-- A new STAFF profile gets the default checklist automatically. Clients are
-- skipped — they're not being onboarded as team members.
create or replace function public.seed_onboarding_tasks()
returns trigger
set search_path = public
as $$
declare
  v_template uuid;
begin
  if new.role = 'client' then
    return new;
  end if;

  select id into v_template from public.onboarding_templates where is_default limit 1;
  if v_template is null then
    return new;
  end if;

  insert into public.onboarding_tasks (profile_id, title, sort_order)
  select new.id, i.title, i.sort_order
  from public.onboarding_template_items i
  where i.template_id = v_template;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists profile_seed_onboarding on public.profiles;
create trigger profile_seed_onboarding after insert on public.profiles
  for each row execute function public.seed_onboarding_tasks();

-- ============ RLS ============

alter table public.applicants enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_items enable row level security;
alter table public.onboarding_tasks enable row level security;

drop policy if exists "applicants_staff_all" on public.applicants;
create policy "applicants_staff_all" on public.applicants for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "onboarding_templates_staff_all" on public.onboarding_templates;
create policy "onboarding_templates_staff_all" on public.onboarding_templates for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "onboarding_template_items_staff_all" on public.onboarding_template_items;
create policy "onboarding_template_items_staff_all" on public.onboarding_template_items for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "onboarding_tasks_staff_all" on public.onboarding_tasks;
create policy "onboarding_tasks_staff_all" on public.onboarding_tasks for all
  using (public.current_role_name() in ('admin', 'rep'));

-- Contractors can see and tick their own onboarding checklist.
drop policy if exists "onboarding_tasks_own_select" on public.onboarding_tasks;
create policy "onboarding_tasks_own_select" on public.onboarding_tasks for select
  using (profile_id = auth.uid());

drop policy if exists "onboarding_tasks_own_update" on public.onboarding_tasks;
create policy "onboarding_tasks_own_update" on public.onboarding_tasks for update
  using (profile_id = auth.uid());
