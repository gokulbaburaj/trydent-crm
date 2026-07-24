-- Trydent Labs CRM — Portal messages (direct client ↔ team thread)
-- Run in the Supabase SQL editor (safe to re-run).

create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_messages_client_id on public.portal_messages(client_id);

-- Notify all staff when a CLIENT sends a message.
create or replace function public.on_portal_message()
returns trigger
set search_path = public
as $$
declare
  v_role public.user_role;
  v_company text;
begin
  select role into v_role from public.profiles where id = new.author_id;
  if v_role = 'client' then
    select company into v_company from public.clients where id = new.client_id;
    perform public.notify_staff(
      'message',
      coalesce(v_company, 'A client') || ' sent a message: ' || left(new.body, 90),
      '/clients/' || new.client_id || '?tab=portal'
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists portal_message_notify on public.portal_messages;
create trigger portal_message_notify after insert on public.portal_messages
  for each row execute function public.on_portal_message();

alter table public.portal_messages enable row level security;

drop policy if exists "portal_messages_staff_all" on public.portal_messages;
create policy "portal_messages_staff_all" on public.portal_messages for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "portal_messages_client_select" on public.portal_messages;
create policy "portal_messages_client_select" on public.portal_messages for select
  using (public.current_role_name() = 'client' and client_id = public.current_client_id());

drop policy if exists "portal_messages_client_insert" on public.portal_messages;
create policy "portal_messages_client_insert" on public.portal_messages for insert
  with check (
    public.current_role_name() = 'client'
    and author_id = auth.uid()
    and client_id = public.current_client_id()
  );
