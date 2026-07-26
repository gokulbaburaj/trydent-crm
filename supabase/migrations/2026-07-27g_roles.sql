-- Trydent Labs CRM — Company roles
--
-- One admin-managed list replacing three uncoordinated free-text fields:
-- `applicants.role_title`, `profiles.team` and `profiles.title`. They could
-- disagree, and did — an applicant hired as "Video editor" landed on the
-- "Design" team with the wrong onboarding checklist.
--
-- A role belongs to a team and points at its own onboarding template, so
-- hiring a Video Editor puts them on Video Editing and starts the Video Editor
-- checklist. Nothing to keep in sync by hand.
--
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team text,
  -- The checklist a new hire in this role should get.
  template_id uuid references public.onboarding_templates(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.applicants
  add column if not exists role_id uuid references public.roles(id) on delete set null;
alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete set null;

create index if not exists idx_applicants_role_id on public.applicants(role_id);
create index if not exists idx_profiles_role_id on public.profiles(role_id);

alter table public.roles enable row level security;

-- Everyone signed in can READ roles (they're labels shown all over the app);
-- only admins can change the list.
drop policy if exists "roles_read" on public.roles;
create policy "roles_read" on public.roles for select using (true);

drop policy if exists "roles_admin_write" on public.roles;
create policy "roles_admin_write" on public.roles for all
  using (public.current_role_name() = 'admin');

-- Seed from what already exists: every distinct team becomes a starter role,
-- and any onboarding template whose name matches a team is linked to it. Adjust
-- from Settings afterwards — this is a starting point, not a guess at your org.
insert into public.roles (name, team)
select distinct p.team, p.team
from public.profiles p
where p.team is not null
  and p.role <> 'client'
  and not exists (select 1 from public.roles r where r.name = p.team);

update public.roles r
   set template_id = t.id
  from public.onboarding_templates t
 where r.template_id is null
   and lower(t.name) = lower(r.name);

-- Point existing staff at their role.
update public.profiles p
   set role_id = r.id
  from public.roles r
 where p.role_id is null
   and p.team is not null
   and r.name = p.team;
