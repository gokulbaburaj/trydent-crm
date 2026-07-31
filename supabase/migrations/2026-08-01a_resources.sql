-- Trydent Labs CRM — Resources
--
-- Notes, SOPs and links, with per-resource visibility.
--
-- The shape, and why
-- ------------------
-- One table, two kinds. A note and a link are the same object to the person
-- using them — "a thing I want to find again" — so they share a list, a search
-- box and an empty state. Splitting them into two tables would buy nothing and
-- cost three of each.
--
-- No file uploads in v1 (decided 1 Aug 2026). That removes the Storage bucket,
-- signed URLs, MIME handling and orphan cleanup. Files slot in later as a third
-- enum value plus a storage_path column; nothing below has to change.
--
-- Visibility is the load-bearing part
-- -----------------------------------
-- `roles.pages` already decides whether someone can open /resources at all.
-- It cannot express "everyone sees the handover SOP, only Design sees the rate
-- card" — that's per-row, so it lives on the row and is enforced here.
--
-- Three states rather than one list of people:
--
--   everyone  — the default, and what most resources are
--   roles     — the level you actually think at. Add a designer to the Design
--               role and they inherit every Design resource, with no going back
--               through old rows.
--   people    — the one-off. Two named contractors, a specific doc.
--
-- `everyone` is a distinct state from "roles, with an empty array" because
-- those mean opposite things (all vs none), and conflating them is exactly how
-- a resource ends up visible to nobody by accident.
--
-- Roles are referenced by id, not name: renaming "Design" to "Design & Brand"
-- in Settings must not silently revoke access to everything tagged with it.
--
-- Run in the Supabase SQL editor. Safe to re-run.


-- ============================================================================
-- 1. Enums
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'resource_kind') then
    create type public.resource_kind as enum ('note', 'link');
  end if;
  if not exists (select 1 from pg_type where typname = 'resource_visibility') then
    create type public.resource_visibility as enum ('everyone', 'roles', 'people');
  end if;
end$$;


-- ============================================================================
-- 2. Table
-- ============================================================================

create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  kind        public.resource_kind not null,

  title       text not null,
  -- One line, shown in the list under the title. Optional: forcing a summary
  -- out of someone saving a link is how links stop getting saved.
  summary     text,
  body        text,          -- markdown, for kind = 'note'
  url         text,          -- for kind = 'link'

  tags        text[] not null default '{}'::text[],

  -- Optional scoping. Most resources are company-wide and leave both null;
  -- these exist so a brand guide can hang off the client it belongs to.
  client_id   uuid references public.clients(id)  on delete set null,
  project_id  uuid references public.projects(id) on delete set null,

  visibility        public.resource_visibility not null default 'everyone',
  visible_role_ids  uuid[] not null default '{}'::uuid[],
  visible_to        uuid[] not null default '{}'::uuid[],

  pinned      boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A note without a body and a link without a URL are both nothing. Checked
  -- here rather than trusted to the form, because the form is not the only way
  -- rows get in — imports and the SQL editor exist too.
  constraint resources_shape check (
    (kind = 'note' and body is not null and length(btrim(body)) > 0) or
    (kind = 'link' and url  is not null and length(btrim(url))  > 0)
  )
);

comment on table public.resources is
  'Notes, SOPs and links. Read access is per-row via visibility/visible_role_ids/'
  'visible_to; whether someone reaches the page at all is roles.pages.';


-- ============================================================================
-- 3. Indexes
-- ============================================================================
-- Foreign keys get covering indexes (the audit checks for this — 46/46 today,
-- and these two keep it that way). The GIN indexes back the tag filter, the
-- per-person visibility check and search.

create index if not exists resources_client_idx     on public.resources (client_id);
create index if not exists resources_project_idx    on public.resources (project_id);
create index if not exists resources_tags_idx       on public.resources using gin (tags);
create index if not exists resources_roles_idx      on public.resources using gin (visible_role_ids);
create index if not exists resources_visible_to_idx on public.resources using gin (visible_to);

create index if not exists resources_search_idx on public.resources using gin (
  to_tsvector(
    'english',
    title || ' ' || coalesce(summary, '') || ' ' || coalesce(body, '')
  )
);


-- ============================================================================
-- 4. updated_at
-- ============================================================================

create or replace function public.touch_resource()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resources_touch on public.resources;
create trigger resources_touch
  before update on public.resources
  for each row execute function public.touch_resource();


-- ============================================================================
-- 5. Helper — the caller's JOB role
-- ============================================================================
-- `current_role_name()` already exists and returns profiles.role, which is the
-- ACCOUNT TYPE (admin / full_time / client). That is not what "Design can see
-- this" means. The job role is profiles.role_id → roles, and nothing exposed it
-- until now.
--
-- Returns the id rather than the name so a rename in Settings can't revoke
-- access. security definer with a pinned search_path, matching every other
-- helper in this database.

create or replace function public.current_role_id()
returns uuid language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select role_id from public.profiles where id = auth.uid();
$$;


-- ============================================================================
-- 6. RLS
-- ============================================================================

alter table public.resources enable row level security;

drop policy if exists resources_admin_all on public.resources;
drop policy if exists resources_read      on public.resources;

-- Writes: admin only. You create, edit and delete; nobody else does.
create policy resources_admin_all on public.resources
  for all to authenticated
  using ((select public.current_is_admin()))
  with check ((select public.current_is_admin()));

-- Reads: whatever you've been granted.
--
-- Every helper call is wrapped in (select …) so Postgres evaluates it once as
-- an InitPlan instead of once per row. Same fix as migration 2026-07-31c —
-- applied here from the start rather than added to the audit later.
--
-- Client portal users match no branch: they have no role_id, they're not admin,
-- and nothing is ever visible to 'everyone' *and* reachable by them, because
-- /resources is a staff page. The database says no, not the UI.
create policy resources_read on public.resources
  for select to authenticated
  using (
    (select public.current_is_admin())
    or (
      (select public.current_role_name()) <> 'client'
      and (
        visibility = 'everyone'
        or (visibility = 'roles'  and (select public.current_role_id()) = any(visible_role_ids))
        or (visibility = 'people' and (select auth.uid())               = any(visible_to))
      )
    )
  );


-- ============================================================================
-- 7. Grant the page to admins' roles
-- ============================================================================
-- Admins bypass roles.pages entirely, so nothing is needed for you. This only
-- seeds the key into roles that already hold a broad grant, so a project
-- manager doesn't have to be re-ticked by hand. Everyone else gets it from
-- Settings → Roles when you decide they should.

update public.roles
set pages = array_append(pages, 'resources')
where not ('resources' = any(pages))
  and 'projects' = any(pages)
  and 'clients'  = any(pages);


-- ============================================================================
-- Verify
-- ============================================================================
-- Run these after applying. The second one is the one that matters — it is the
-- difference between a visibility feature and the appearance of one.
--
--   -- 1. Structure
--   select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'resources';
--   -- expect: resources_admin_all (ALL), resources_read (SELECT)
--
--   -- 2. Behaviour. Swap in a real non-admin profile id.
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"<non-admin-profile-uuid>"}';
--     select count(*) from public.resources;              -- only their grants
--     select title, visibility from public.resources;     -- eyeball it
--   rollback;
