-- Trydent Labs CRM — Meetings upgrade
-- Phase 5 of the portal roadmap. Turns activities into proper meetings
-- (agenda, notes, attendees) and lets clients request a call.
--
-- Attendees are a uuid[] column rather than a join table. The app already uses
-- array columns (clients.tags) and attendee lists are small and always read
-- alongside their activity, so a join table would add a query for no benefit.
--
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.activities add column if not exists agenda text;
alter table public.activities add column if not exists notes text;
alter table public.activities add column if not exists attendee_ids uuid[] not null default '{}';
-- Off by default: an internal note should never leak because someone forgot.
alter table public.activities add column if not exists client_visible boolean not null default false;

-- Clients can read the meetings their team marked visible, and nothing else.
drop policy if exists "activities_client_select" on public.activities;
create policy "activities_client_select" on public.activities for select
  using (
    public.current_role_name() = 'client'
    and client_visible = true
    and client_id = public.current_client_id()
  );

-- ============ MEETING REQUESTS ============

create table if not exists public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  topic text not null,
  preferred_date date,
  note text,
  status text not null default 'pending',
  activity_id uuid references public.activities(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint meeting_requests_status_valid
    check (status in ('pending', 'scheduled', 'declined'))
);

create index if not exists idx_meeting_requests_client_id on public.meeting_requests(client_id);

create or replace function public.on_meeting_request()
returns trigger
set search_path = public
as $$
declare
  v_company text;
begin
  select company into v_company from public.clients where id = new.client_id;
  perform public.notify_staff(
    'meeting_request',
    coalesce(v_company, 'A client') || ' requested a call: ' || left(new.topic, 90),
    '/clients/' || new.client_id || '?tab=portal'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists meeting_request_notify on public.meeting_requests;
create trigger meeting_request_notify after insert on public.meeting_requests
  for each row execute function public.on_meeting_request();

alter table public.meeting_requests enable row level security;

drop policy if exists "meeting_requests_staff_all" on public.meeting_requests;
create policy "meeting_requests_staff_all" on public.meeting_requests for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "meeting_requests_client_select" on public.meeting_requests;
create policy "meeting_requests_client_select" on public.meeting_requests for select
  using (
    public.current_role_name() = 'client'
    and client_id = public.current_client_id()
  );

drop policy if exists "meeting_requests_client_insert" on public.meeting_requests;
create policy "meeting_requests_client_insert" on public.meeting_requests for insert
  with check (
    public.current_role_name() = 'client'
    and requested_by = auth.uid()
    and client_id = public.current_client_id()
  );
