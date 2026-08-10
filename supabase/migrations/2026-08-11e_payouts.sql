-- Payouts: one transfer, many lines.
--
-- ============================================================================
-- What was missing
-- ============================================================================
--
-- `project_allocations.paid` was a boolean. Three of eight rows were true and
-- the database could not say when any of them were paid — so "paid this
-- month", "vs last month", and any payout history were unanswerable. The same
-- shape as the goals running total: a fact recorded as a state instead of an
-- event.
--
-- It also modelled the wrong unit. You don't pay a project line; you pay a
-- person once, for several things at a time. Ravi's three lines across two
-- projects are one transfer, and a history that lists them as three separate
-- payouts describes something that never happened.
--
-- So a payout is the transfer, and payout_lines are what it covered.
--
-- ============================================================================
-- Two sources, deliberately
-- ============================================================================
--
-- Money owed to a person lives in two tables that don't know about each
-- other: `project_allocations` (derived from a project's budget) and
-- `staff_payments` (one-offs, read by the Team page). A line points at either,
-- never both.
--
-- They are NOT merged here. Merging is a migration of live rows plus a rewrite
-- of the Team page, for no gain the UI can't get by reading both. The check
-- constraint keeps a line honest about which kind it is.
--
-- ============================================================================
-- Why lines snapshot their own label and amount
-- ============================================================================
--
-- `on delete set null` on both source columns, with `label` and `amount` held
-- on the line itself. A payout is a record of money that actually left — it
-- must survive the project being deleted, the allocation being removed, or the
-- percentage being changed afterwards. If the history recomputed from live
-- allocations, editing a percent would silently rewrite what you paid someone
-- last month.

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  paid_on date not null default current_date,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  allocation_id uuid references public.project_allocations(id) on delete set null,
  staff_payment_id uuid references public.staff_payments(id) on delete set null,
  /* Snapshots. See the note above — history must not move when live rows do. */
  amount numeric not null,
  label text,
  constraint payout_lines_one_source check (
    (allocation_id is not null)::int + (staff_payment_id is not null)::int <= 1
  )
);

create index if not exists payouts_profile_idx on public.payouts (profile_id, paid_on desc);
create index if not exists payout_lines_payout_idx on public.payout_lines (payout_id);
create index if not exists payout_lines_allocation_idx on public.payout_lines (allocation_id);
create index if not exists payout_lines_staff_payment_idx on public.payout_lines (staff_payment_id);

alter table public.payouts enable row level security;
alter table public.payout_lines enable row level security;

-- Same gate as the page itself. `accounts` stays the permission key — the
-- rename is what people see, not what RLS and roles.pages store.
drop policy if exists "payouts_manage" on public.payouts;
create policy "payouts_manage" on public.payouts
  for all using ((select private.current_can('accounts')))
  with check ((select private.current_can('accounts')));

drop policy if exists "payout_lines_manage" on public.payout_lines;
create policy "payout_lines_manage" on public.payout_lines
  for all using ((select private.current_can('accounts')))
  with check ((select private.current_can('accounts')));

-- ============================================================================
-- Keep the old flags in step
-- ============================================================================
--
-- `project_allocations.paid` and `staff_payments.status` stay, maintained from
-- the lines. Same reasoning as key_results.current_manual: the Team page and
-- the Projects page read them, and turning this into a three-page change buys
-- nothing. Nothing writes them by hand any more.

create or replace function public.sync_payout_flags()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_alloc uuid;
  v_staff uuid;
begin
  v_alloc := coalesce(new.allocation_id, old.allocation_id);
  v_staff := coalesce(new.staff_payment_id, old.staff_payment_id);

  if v_alloc is not null then
    update public.project_allocations a
    set paid = exists (
      select 1 from public.payout_lines l where l.allocation_id = a.id
    )
    where a.id = v_alloc;
  end if;

  if v_staff is not null then
    update public.staff_payments s
    set status = case
      when exists (select 1 from public.payout_lines l where l.staff_payment_id = s.id)
        then 'paid' else 'pending' end
    where s.id = v_staff;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists payout_lines_sync on public.payout_lines;
create trigger payout_lines_sync
  after insert or update or delete on public.payout_lines
  for each row execute function public.sync_payout_flags();

-- ============================================================================
-- Backfill
-- ============================================================================
--
-- Three allocations are already flagged paid. Their real payment dates are
-- unrecoverable — the column never existed — so each becomes a payout dated by
-- the allocation's `created_at`, carrying a note saying so. Dating them today
-- would put three fabricated payouts in this month's total, which is the one
-- figure the new page leads with.
--
-- One payout per allocation here rather than grouping by person and date:
-- grouping would assert they were paid together, and nothing in the data
-- supports that.

do $$
declare
  a record;
  v_payout uuid;
begin
  for a in
    select al.id, al.profile_id, al.created_at, al.amount, al.percent, al.role_label,
           p.name as project_name,
           coalesce(d.deal_value, p.budget, 0) as budget
    from public.project_allocations al
    join public.projects p on p.id = al.project_id
    left join public.deals d on d.id = p.deal_id
    where al.paid
      and not exists (select 1 from public.payout_lines l where l.allocation_id = al.id)
  loop
    insert into public.payouts (profile_id, paid_on, note)
    values (a.profile_id, a.created_at::date, 'Backfilled — original payment date unknown')
    returning id into v_payout;

    insert into public.payout_lines (payout_id, allocation_id, amount, label)
    values (
      v_payout,
      a.id,
      case when a.percent is not null then a.budget * a.percent / 100 else a.amount end,
      coalesce(a.project_name, 'Project') ||
        case when a.role_label is not null then ' · ' || a.role_label else '' end
    );
  end loop;
end $$;

-- ============================================================================
-- Verification
-- ============================================================================
--
--   select count(*) from public.payouts;        -- 3
--   select count(*) from public.payout_lines;   -- 3
--
--   -- every paid allocation has exactly one line, and no unpaid one has any
--   select al.paid, count(l.id) as lines
--   from public.project_allocations al
--   left join public.payout_lines l on l.allocation_id = al.id
--   group by al.id, al.paid;
