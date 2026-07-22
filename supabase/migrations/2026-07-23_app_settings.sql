-- Trydent Labs CRM — App settings (base currency for money conversion)
-- Run in the Supabase SQL editor (safe to re-run).
--
-- Every money value in the app (deal_value, paid, staff_payments.amount) is
-- STORED in this base currency. The per-user display currency converts from
-- it using live rates, so the toggle shows real values, not just new symbols.

create table if not exists public.app_settings (
  id boolean primary key default true check (id),   -- forces a single row
  base_currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Everyone signed in can read it (money formatting needs it everywhere).
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings for select using (true);

-- Only admins/reps can change it.
drop policy if exists "app_settings_staff_write" on public.app_settings;
create policy "app_settings_staff_write" on public.app_settings for all
  using (public.current_role_name() in ('admin', 'rep'));
