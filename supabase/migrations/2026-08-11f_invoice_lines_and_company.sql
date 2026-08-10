-- Line items, and the sender details the invoice template needs.
--
-- ============================================================================
-- Why
-- ============================================================================
--
-- The Figma template (#TL005 / #TL006, 2550×3300 — US Letter at 300 DPI) has a
-- charges table with description, quantity and total, then Subtotal → Total.
-- `invoices` stored a single `amount`, so generating from it would produce a
-- one-row table with no description and a quantity of 1 forever.
--
-- The template's footer also carries sender details that exist nowhere in the
-- database — name, address, email, phone, bank account, IFSC, branch, UPI ID.
-- `app_settings` had exactly three columns: id, base_currency, updated_at.
--
-- ============================================================================
-- quantity × unit_price, even though every current invoice is qty 1
-- ============================================================================
--
-- Both template frames show a quantity of 1, and it would be simpler to store
-- a flat amount per line. Storing rate and quantity separately costs nothing —
-- it renders identically when quantity is 1 — and it's the difference between
-- "3 × ₹5,000" being expressible or not. A flat amount can't be decomposed
-- later; a rate can always be collapsed.
--
-- `amount` is generated, not stored twice. A line whose amount disagreed with
-- its own quantity × rate is the kind of thing nobody notices until a client
-- does.
--
-- ============================================================================
-- Sender details are ONE row, not a table
-- ============================================================================
--
-- app_settings is a singleton (`id boolean primary key`, always true). These
-- belong there rather than in a `companies` table because there is one
-- company. A table would invite a second row that nothing knows how to choose
-- between.

alter table public.app_settings
  add column if not exists company_name text,
  add column if not exists company_address text,
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_branch text,
  add column if not exists upi_id text,
  -- Free text under the bank block. The template reads "Payment can be done
  -- either through Bank Transfer or UPI".
  add column if not exists invoice_footer_note text;

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  amount numeric generated always as (quantity * unit_price) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_lines_invoice_idx
  on public.invoice_lines (invoice_id, sort_order);

alter table public.invoice_lines enable row level security;

-- Invoices ride on the `clients` grant — see ROUTE_KEYS in lib/permissions.ts
-- and the note on the Invoices nav item. Their lines must match, or someone
-- could read a total they can't read the breakdown of, or vice versa.
drop policy if exists "invoice_lines_manage" on public.invoice_lines;
create policy "invoice_lines_manage" on public.invoice_lines
  for all using ((select private.current_can('clients')))
  with check ((select private.current_can('clients')));

/*
  Clients read their own invoice lines through the portal, matching the
  existing invoices policy: only for their own client, and never for a draft.
  Without this the portal would show a total with an empty breakdown.
*/
drop policy if exists "invoice_lines_client_read" on public.invoice_lines;
create policy "invoice_lines_client_read" on public.invoice_lines
  for select using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_lines.invoice_id
        and i.client_id = (select private.current_client_id())
        and i.status <> 'draft'
    )
  );

-- ============================================================================
-- Backfill
-- ============================================================================
--
-- The one existing invoice becomes a single line carrying its whole amount.
-- The description is deliberately vague — nothing in the database says what
-- #TL-001 was for, and inventing a plausible line item would be worse than an
-- obvious placeholder someone edits.

insert into public.invoice_lines (invoice_id, description, quantity, unit_price, sort_order)
select i.id, 'Services rendered', 1, i.amount, 0
from public.invoices i
where not exists (
  select 1 from public.invoice_lines l where l.invoice_id = i.id
);

-- ============================================================================
-- Seed the sender block from the invoice template
-- ============================================================================
--
-- These values are read off the #TL005 artwork Gokul supplied, so they're his
-- own details going into his own database rather than anything invented. Only
-- written where the column is still null, so re-running can't clobber edits.

update public.app_settings set
  company_name        = coalesce(company_name, 'Gokul Baburaj'),
  company_address     = coalesce(company_address, E'Kochi, Kerala\nIndia'),
  company_email       = coalesce(company_email, 'gokubraj123@gmail.com'),
  company_phone       = coalesce(company_phone, '+91 8593953115'),
  bank_account_number = coalesce(bank_account_number, '67299900525'),
  bank_ifsc           = coalesce(bank_ifsc, 'SBIN0063880'),
  bank_branch         = coalesce(bank_branch, E'SBI PARAMEKKAVU TEMPLE\nBRANCH THRISSUR'),
  upi_id              = coalesce(upi_id, 'gokubraj123@oksbi'),
  invoice_footer_note = coalesce(
    invoice_footer_note,
    'Payment can be done either through Bank Transfer or UPI'
  )
where id;

-- ============================================================================
-- Verification
-- ============================================================================
--
--   select number, amount,
--          (select sum(l.amount) from public.invoice_lines l
--            where l.invoice_id = i.id) as lines_total
--   from public.invoices i;
--     → lines_total must equal amount on every row
--
--   select company_name, upi_id, bank_ifsc from public.app_settings;
