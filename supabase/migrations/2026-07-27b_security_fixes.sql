-- Trydent Labs CRM — Security and index fixes from the 27 July audit
-- See AUDIT.md items S1, S2, P3. Run in the Supabase SQL editor. Safe to re-run.

-- ============ S1 (CRITICAL): stale activities policy ============
--
-- Postgres ORs permissive policies together, so the old unrestricted client
-- policy was overriding the client_visible check added in 2026-07-26d. Any
-- portal client could read every internal meeting and its private notes for
-- their account by querying the table directly.
--
-- Dropping the old policy leaves activities_client_select as the only client
-- SELECT rule, which is what was intended.

drop policy if exists "activities_client_select_own" on public.activities;

-- Re-assert the correct policy so this file is self-contained.
drop policy if exists "activities_client_select" on public.activities;
create policy "activities_client_select" on public.activities for select
  using (
    public.current_role_name() = 'client'
    and client_visible = true
    and client_id = public.current_client_id()
  );

-- ============ S2 (HIGH): pin search_path on the RLS helpers ============
--
-- A security-definer function without a fixed search_path resolves object
-- names using the CALLER's path, so a user able to create a shadowing
-- `profiles` object could make these return anything — including 'admin'.
-- Every RLS policy in the database calls one of these two, so this is the
-- foundation of the whole authorisation model.

create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- ============ P3: missing foreign-key indexes ============
--
-- notifications.recipient_id is the urgent one: the bell polls it every 60
-- seconds from every open tab.

create index if not exists idx_project_tasks_assigned_to
  on public.project_tasks(assigned_to);
create index if not exists idx_activities_assigned_to
  on public.activities(assigned_to);
create index if not exists idx_notifications_recipient_id
  on public.notifications(recipient_id);
