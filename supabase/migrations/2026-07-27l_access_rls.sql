-- Trydent Labs CRM — enforce the new access grants in the database
--
-- 2026-07-27k added the grants. This makes them mean something.
--
-- Until now every staff table said the same thing: `current_role_name() in
-- ('admin','rep')`. So hiding Accounts in the sidebar hid nothing — a rep could
-- open the network tab, call the REST API directly and read every allocation
-- and every payment. That's the gap between "what should this person see" and
-- "what can this person reach", and this file closes it for the tables where
-- the difference actually matters.
--
-- Scope, deliberately limited to the sensitive four:
--
--   staff_payments      what people are paid
--   project_allocations who is committed how much money
--   applicants          hiring, including candidates who don't know they're
--                       being considered
--   goals / key_results company targets
--
-- Left alone: clients, deals, projects, tasks, activities. Any staff member
-- needs those to do the job, the current policies already work, and rewriting
-- twenty policies in one migration is how the activities leak happened. Page
-- hiding still tidies those away for people who don't need them.
--
-- Run AFTER 2026-07-27k. Safe to re-run.


-- ============================================================================
-- 1. Pay — admin only, plus your own row
-- ============================================================================
-- Previously any rep could read every payment plan. Pay is admin-only now,
-- matching canSeeContractorPay() in the app, and a person can always see their
-- own regardless of role.

drop policy if exists "staff_payments_staff_all" on public.staff_payments;
create policy "staff_payments_admin_all" on public.staff_payments for all
  using (public.current_is_admin())
  with check (public.current_is_admin());

drop policy if exists "staff_payments_own_select" on public.staff_payments;
create policy "staff_payments_own_select" on public.staff_payments for select
  using (profile_id = (select auth.uid()));


-- ============================================================================
-- 2. Allocations — whoever has the Accounts page, plus your own row
-- ============================================================================

drop policy if exists "project_allocations_staff_all" on public.project_allocations;
create policy "project_allocations_accounts_all" on public.project_allocations for all
  using (public.current_can('accounts'))
  with check (public.current_can('accounts'));

drop policy if exists "project_allocations_own_select" on public.project_allocations;
create policy "project_allocations_own_select" on public.project_allocations for select
  using (profile_id = (select auth.uid()));


-- ============================================================================
-- 3. Hiring — whoever has the Recruiting page
-- ============================================================================
-- Applicant rows carry names, emails and CVs of people who often haven't told
-- their current employer. The narrowest sensible grant.

drop policy if exists "applicants_staff_all" on public.applicants;
create policy "applicants_recruiting_all" on public.applicants for all
  using (public.current_can('recruiting'))
  with check (public.current_can('recruiting'));

drop policy if exists "onboarding_templates_staff_all" on public.onboarding_templates;
create policy "onboarding_templates_manage" on public.onboarding_templates for all
  using (public.current_can('onboarding') or public.current_can('recruiting'))
  with check (public.current_can('onboarding') or public.current_can('recruiting'));

drop policy if exists "onboarding_template_items_staff_all" on public.onboarding_template_items;
create policy "onboarding_template_items_manage" on public.onboarding_template_items for all
  using (public.current_can('onboarding') or public.current_can('recruiting'))
  with check (public.current_can('onboarding') or public.current_can('recruiting'));

drop policy if exists "onboarding_tasks_staff_all" on public.onboarding_tasks;
create policy "onboarding_tasks_manage" on public.onboarding_tasks for all
  using (public.current_can('onboarding'))
  with check (public.current_can('onboarding'));

-- A new hire can always see and tick their own checklist, whatever their role
-- grants — this is the one case where the row is about you, not about access.
drop policy if exists "onboarding_tasks_own_select" on public.onboarding_tasks;
create policy "onboarding_tasks_own_select" on public.onboarding_tasks for select
  using (profile_id = (select auth.uid()));

drop policy if exists "onboarding_tasks_own_update" on public.onboarding_tasks;
create policy "onboarding_tasks_own_update" on public.onboarding_tasks for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));


-- ============================================================================
-- 4. Goals — whoever has the Goals page
-- ============================================================================

drop policy if exists "goals_staff_all" on public.goals;
create policy "goals_manage" on public.goals for all
  using (public.current_can('goals'))
  with check (public.current_can('goals'));

drop policy if exists "key_results_staff_all" on public.key_results;
create policy "key_results_manage" on public.key_results for all
  using (public.current_can('goals'))
  with check (public.current_can('goals'));


-- ============================================================================
-- 5. Verify — run this after, as an ordinary employee if you can
-- ============================================================================
--
-- As yourself (admin) everything should return rows. Signed in as someone whose
-- role has no 'accounts' grant, the first should return nothing but the second
-- should still show their own line:
--
--   select count(*) from public.project_allocations;
--   select count(*) from public.project_allocations where profile_id = auth.uid();
--
-- And confirm the grants resolve as expected for the current session:
--
--   select public.current_role_name()  as account_type,
--          public.current_is_admin()   as is_admin,
--          public.current_pages()      as pages,
--          public.current_can('accounts') as can_accounts;
