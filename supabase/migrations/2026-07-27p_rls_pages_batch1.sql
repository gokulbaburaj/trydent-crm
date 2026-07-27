-- Trydent Labs CRM — RLS batch 1 of 3: client-facing tables
--
-- Why this is needed
-- ------------------
-- Every one of these tables still says `current_role_name() in ('admin','rep')`
-- — which the rename in 2026-07-27n turned into `('admin','full_time')`. That
-- breaks the access model in both directions:
--
--   An HR person on part-time is granted the Clients page and sees zero
--   clients, because part_time matches no policy.
--
--   An Executive on full-time has Pipeline hidden in the sidebar and can still
--   read every deal through the REST API, because full_time matches the policy.
--
-- Employment type stopped meaning access in the app; it still means everything
-- in the database. This batch fixes the client-facing half.
--
-- Split into three files on purpose. Overlapping permissive policies are what
-- caused the activities leak, and I'd rather you verify each batch than review
-- sixty lines of diff in one go.
--
-- Nothing here touches the client-portal policies — those are separate,
-- correct, and out of scope.
--
-- Run AFTER 2026-07-27k. Safe to re-run.


-- ============================================================================
-- clients
-- ============================================================================

drop policy if exists "clients_staff_all" on public.clients;
create policy "clients_page_all" on public.clients for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));


-- ============================================================================
-- deals — the Pipeline page
-- ============================================================================

drop policy if exists "deals_staff_all" on public.deals;
create policy "deals_page_all" on public.deals for all
  using (public.current_can('pipeline'))
  with check (public.current_can('pipeline'));


-- ============================================================================
-- client_portals, documents, invoices
-- ============================================================================
-- All three hang off a client record, so they follow the Clients grant. If you
-- later want invoices behind Accounts instead, that's a one-word change here —
-- but today the invoice manager lives inside the client panel, so splitting
-- them would give someone a page they can't use.

drop policy if exists "portals_staff_all" on public.client_portals;
create policy "portals_page_all" on public.client_portals for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));

drop policy if exists "client_documents_staff_all" on public.client_documents;
create policy "client_documents_page_all" on public.client_documents for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));

drop policy if exists "invoices_staff_all" on public.invoices;
create policy "invoices_page_all" on public.invoices for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));


-- ============================================================================
-- portal_updates, portal_messages
-- ============================================================================

drop policy if exists "portal_updates_staff_all" on public.portal_updates;
create policy "portal_updates_page_all" on public.portal_updates for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));

drop policy if exists "portal_messages_staff_all" on public.portal_messages;
create policy "portal_messages_page_all" on public.portal_messages for all
  using (public.current_can('clients'))
  with check (public.current_can('clients'));


-- ============================================================================
-- Verify before moving to batch 2
-- ============================================================================
--
-- As yourself (admin) — everything, unchanged:
--
--   select count(*) from public.clients;
--   select count(*) from public.deals;
--
-- Then confirm no client-facing table is still gated on employment type:
--
--   select tablename, policyname, qual
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('clients','deals','client_portals','client_documents',
--                       'invoices','portal_updates','portal_messages')
--     and qual like '%full_time%';
--
-- That should return zero rows. If it returns any, tell me which before you
-- run batch 2.
