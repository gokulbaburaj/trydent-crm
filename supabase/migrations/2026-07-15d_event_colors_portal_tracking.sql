-- Trydent Labs CRM — Event colors + portal open tracking
-- Run in the Supabase SQL editor (safe to re-run).

-- Custom color per schedule item (hex string, chosen via right-click)
alter table public.activities add column if not exists color text;

-- When the client last opened their portal
alter table public.client_portals add column if not exists last_opened_at timestamptz;

-- Clients can't update portal rows directly (RLS), so they call this
-- security-definer function which only touches the timestamp on their own portal.
create or replace function public.touch_portal()
returns void
set search_path = public
as $$
begin
  update public.client_portals
  set last_opened_at = now()
  where client_id = public.current_client_id();
end;
$$ language plpgsql security definer;

grant execute on function public.touch_portal() to authenticated;
