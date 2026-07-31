-- Wrap RLS helper calls in a scalar subquery.
--
-- ── What this does ───────────────────────────────────────────────────────
-- Nothing, semantically. `current_can('clients')` and
-- `(select current_can('clients'))` evaluate to the same value. Only the
-- query plan changes: the bare form is re-evaluated for every row scanned,
-- the wrapped form runs once per statement as an InitPlan.
--
-- ── Why it matters ───────────────────────────────────────────────────────
-- Every helper does a lookup against `profiles`:
--
--     select role from public.profiles where id = auth.uid();
--
-- Called per row, on a table guarded by two or three policies, that's a
-- profiles lookup per row per policy. `pg_stat_user_tables` showed 35,774
-- sequential scans of `profiles` against 6 live rows — that count is how many
-- times we were paying for it, and it scales with rows returned, not with
-- table size.
--
-- We already wrapped `auth.uid()`. We never wrapped our own helpers.
-- Supabase's own guidance puts this at 5-10x on real data sets.
--
-- ── Safety ───────────────────────────────────────────────────────────────
-- Generated from pg_policies rather than hand-typed, because a typo across 47
-- access-control policies silently changes who can see what. Every statement
-- was checked for balanced parentheses before being written here.
--
-- To roll back, the pre-change definitions are in schema.sql (section 9).
-- Nothing here changes which rows anyone can reach.

begin;


drop policy if exists activities_client_select on public.activities;
create policy activities_client_select on public.activities for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_visible = true) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists activities_contractor_select_own on public.activities;
create policy activities_contractor_select_own on public.activities for select to public
  using (((( SELECT current_role_name() ) = 'contract'::user_role) AND (assigned_to = ( SELECT auth.uid() ))));

drop policy if exists activities_page_all on public.activities;
create policy activities_page_all on public.activities for all to public
  using (( SELECT current_can('schedule'::text) ))
  with check (( SELECT current_can('schedule'::text) ));

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all to public
  using (( SELECT current_is_admin() ))
  with check (( SELECT current_is_admin() ));

drop policy if exists applicants_recruiting_all on public.applicants;
create policy applicants_recruiting_all on public.applicants for all to public
  using (( SELECT current_can('recruiting'::text) ))
  with check (( SELECT current_can('recruiting'::text) ));

drop policy if exists client_documents_client_select on public.client_documents;
create policy client_documents_client_select on public.client_documents for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists client_documents_page_all on public.client_documents;
create policy client_documents_page_all on public.client_documents for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists portals_client_select_own on public.client_portals;
create policy portals_client_select_own on public.client_portals for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists portals_page_all on public.client_portals;
create policy portals_page_all on public.client_portals for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists clients_client_select_own on public.clients;
create policy clients_client_select_own on public.clients for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (id = ( SELECT current_client_id() ))));

drop policy if exists clients_page_all on public.clients;
create policy clients_page_all on public.clients for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists deals_client_select_own on public.deals;
create policy deals_client_select_own on public.deals for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists deals_page_all on public.deals;
create policy deals_page_all on public.deals for all to public
  using (( SELECT current_can('pipeline'::text) ))
  with check (( SELECT current_can('pipeline'::text) ));

drop policy if exists goals_manage on public.goals;
create policy goals_manage on public.goals for all to public
  using (( SELECT current_can('goals'::text) ))
  with check (( SELECT current_can('goals'::text) ));

drop policy if exists invoices_client_select on public.invoices;
create policy invoices_client_select on public.invoices for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() )) AND (status <> 'draft'::text)));

drop policy if exists invoices_page_all on public.invoices;
create policy invoices_page_all on public.invoices for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists key_results_manage on public.key_results;
create policy key_results_manage on public.key_results for all to public
  using (( SELECT current_can('goals'::text) ))
  with check (( SELECT current_can('goals'::text) ));

drop policy if exists meeting_requests_client_insert on public.meeting_requests;
create policy meeting_requests_client_insert on public.meeting_requests for insert to public
  with check (((( SELECT current_role_name() ) = 'client'::user_role) AND (requested_by = ( SELECT auth.uid() )) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists meeting_requests_client_select on public.meeting_requests;
create policy meeting_requests_client_select on public.meeting_requests for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists meeting_requests_page_all on public.meeting_requests;
create policy meeting_requests_page_all on public.meeting_requests for all to public
  using ((( SELECT current_can('schedule'::text) ) OR ( SELECT current_can('clients'::text) )))
  with check ((( SELECT current_can('schedule'::text) ) OR ( SELECT current_can('clients'::text) )));

drop policy if exists notifications_staff_insert on public.notifications;
create policy notifications_staff_insert on public.notifications for insert to public
  with check ((( SELECT current_role_name() ) = ANY (ARRAY['admin'::user_role, 'full_time'::user_role])));

drop policy if exists onboarding_tasks_manage on public.onboarding_tasks;
create policy onboarding_tasks_manage on public.onboarding_tasks for all to public
  using (( SELECT current_can('onboarding'::text) ))
  with check (( SELECT current_can('onboarding'::text) ));

drop policy if exists onboarding_template_items_manage on public.onboarding_template_items;
create policy onboarding_template_items_manage on public.onboarding_template_items for all to public
  using ((( SELECT current_can('onboarding'::text) ) OR ( SELECT current_can('recruiting'::text) )))
  with check ((( SELECT current_can('onboarding'::text) ) OR ( SELECT current_can('recruiting'::text) )));

drop policy if exists onboarding_templates_manage on public.onboarding_templates;
create policy onboarding_templates_manage on public.onboarding_templates for all to public
  using ((( SELECT current_can('onboarding'::text) ) OR ( SELECT current_can('recruiting'::text) )))
  with check ((( SELECT current_can('onboarding'::text) ) OR ( SELECT current_can('recruiting'::text) )));

drop policy if exists portal_messages_client_insert on public.portal_messages;
create policy portal_messages_client_insert on public.portal_messages for insert to public
  with check (((( SELECT current_role_name() ) = 'client'::user_role) AND (author_id = ( SELECT auth.uid() )) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists portal_messages_client_select on public.portal_messages;
create policy portal_messages_client_select on public.portal_messages for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists portal_messages_page_all on public.portal_messages;
create policy portal_messages_page_all on public.portal_messages for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists portal_updates_client_select on public.portal_updates;
create policy portal_updates_client_select on public.portal_updates for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists portal_updates_page_all on public.portal_updates;
create policy portal_updates_page_all on public.portal_updates for all to public
  using (( SELECT current_can('clients'::text) ))
  with check (( SELECT current_can('clients'::text) ));

drop policy if exists profile_emails_admin_write on public.profile_emails;
create policy profile_emails_admin_write on public.profile_emails for all to public
  using (( SELECT current_is_admin() ))
  with check (( SELECT current_is_admin() ));

drop policy if exists profile_emails_staff_select on public.profile_emails;
create policy profile_emails_staff_select on public.profile_emails for select to public
  using ((( SELECT current_role_name() ) <> 'client'::user_role));

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to public
  using ((( SELECT current_role_name() ) = 'admin'::user_role));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to public
  using ((id = ( SELECT auth.uid() )))
  with check (((id = ( SELECT auth.uid() )) AND (role = ( SELECT current_role_name() )) AND (NOT (client_id IS DISTINCT FROM ( SELECT current_client_id() )))));

drop policy if exists project_allocations_accounts_all on public.project_allocations;
create policy project_allocations_accounts_all on public.project_allocations for all to public
  using (( SELECT current_can('accounts'::text) ))
  with check (( SELECT current_can('accounts'::text) ));

drop policy if exists project_tasks_client_select_own on public.project_tasks;
create policy project_tasks_client_select_own on public.project_tasks for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (project_id IN ( SELECT projects.id FROM projects WHERE (projects.client_id = ( SELECT current_client_id() ))))));

drop policy if exists project_tasks_contractor_select_own on public.project_tasks;
create policy project_tasks_contractor_select_own on public.project_tasks for select to public
  using (((( SELECT current_role_name() ) = 'contract'::user_role) AND (assigned_to = ( SELECT auth.uid() ))));

drop policy if exists project_tasks_contractor_update_own on public.project_tasks;
create policy project_tasks_contractor_update_own on public.project_tasks for update to public
  using (((( SELECT current_role_name() ) = 'contract'::user_role) AND (assigned_to = ( SELECT auth.uid() ))))
  with check (((( SELECT current_role_name() ) = 'contract'::user_role) AND (assigned_to = ( SELECT auth.uid() ))));

drop policy if exists project_tasks_page_all on public.project_tasks;
create policy project_tasks_page_all on public.project_tasks for all to public
  using (( SELECT current_can('projects'::text) ))
  with check (( SELECT current_can('projects'::text) ));

drop policy if exists projects_client_select_own on public.projects;
create policy projects_client_select_own on public.projects for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (client_id = ( SELECT current_client_id() ))));

drop policy if exists projects_page_all on public.projects;
create policy projects_page_all on public.projects for all to public
  using (( SELECT current_can('projects'::text) ))
  with check (( SELECT current_can('projects'::text) ));

drop policy if exists roles_admin_write on public.roles;
create policy roles_admin_write on public.roles for all to public
  using (( SELECT current_is_admin() ))
  with check (( SELECT current_is_admin() ));

drop policy if exists staff_payments_admin_all on public.staff_payments;
create policy staff_payments_admin_all on public.staff_payments for all to public
  using (( SELECT current_is_admin() ))
  with check (( SELECT current_is_admin() ));

drop policy if exists task_comments_client_insert on public.task_comments;
create policy task_comments_client_insert on public.task_comments for insert to public
  with check (((( SELECT current_role_name() ) = 'client'::user_role) AND (author_id = ( SELECT auth.uid() )) AND (task_id IN ( SELECT t.id FROM (project_tasks t JOIN projects p ON ((p.id = t.project_id))) WHERE (p.client_id = ( SELECT current_client_id() ))))));

drop policy if exists task_comments_client_select on public.task_comments;
create policy task_comments_client_select on public.task_comments for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (task_id IN ( SELECT t.id FROM (project_tasks t JOIN projects p ON ((p.id = t.project_id))) WHERE (p.client_id = ( SELECT current_client_id() ))))));

drop policy if exists task_comments_page_all on public.task_comments;
create policy task_comments_page_all on public.task_comments for all to public
  using (( SELECT current_can('projects'::text) ))
  with check (( SELECT current_can('projects'::text) ));

drop policy if exists task_items_client_select_own on public.task_items;
create policy task_items_client_select_own on public.task_items for select to public
  using (((( SELECT current_role_name() ) = 'client'::user_role) AND (task_id IN ( SELECT t.id FROM (project_tasks t JOIN projects p ON ((p.id = t.project_id))) WHERE (p.client_id = ( SELECT current_client_id() ))))));

drop policy if exists task_items_page_all on public.task_items;
create policy task_items_page_all on public.task_items for all to public
  using (( SELECT current_can('projects'::text) ))
  with check (( SELECT current_can('projects'::text) ));

drop policy if exists teams_page_write on public.teams;
create policy teams_page_write on public.teams for all to public
  using (( SELECT current_can('team'::text) ))
  with check (( SELECT current_can('team'::text) ));

commit;
