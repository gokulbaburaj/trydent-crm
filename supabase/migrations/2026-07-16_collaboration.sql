-- Trydent Labs CRM — Sprint A: comments, approvals, portal updates, notifications
-- Run this whole file in the Supabase SQL editor (safe to re-run).

-- ============ TASK COMMENTS ============
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.project_tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task_id on public.task_comments(task_id);

-- ============ TASK APPROVALS ============
alter table public.project_tasks add column if not exists approved_at timestamptz;
alter table public.project_tasks add column if not exists approved_by uuid references public.profiles(id) on delete set null;

-- ============ PORTAL UPDATES (client-facing feed) ============
create table if not exists public.portal_updates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_portal_updates_client_id on public.portal_updates(client_id);

-- ============ NOTIFICATIONS ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,          -- 'comment' | 'approval' | 'portal' | 'assignment'
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, read_at);

-- ============ HELPER: fan a notification out to all staff ============
create or replace function public.notify_staff(p_type text, p_body text, p_link text)
returns void
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, body, link)
  select id, p_type, p_body, p_link from public.profiles where role in ('admin', 'rep');
end;
$$ language plpgsql security definer;

-- ============ TRIGGER: client comments notify staff ============
create or replace function public.on_task_comment()
returns trigger
set search_path = public
as $$
declare
  v_role public.user_role;
  v_company text;
  v_project uuid;
begin
  select role into v_role from public.profiles where id = new.author_id;
  if v_role = 'client' then
    select c.company, t.project_id into v_company, v_project
    from public.project_tasks t
    join public.projects p on p.id = t.project_id
    join public.clients c on c.id = p.client_id
    where t.id = new.task_id;
    perform public.notify_staff(
      'comment',
      coalesce(v_company, 'A client') || ' commented: ' || left(new.body, 90),
      '/projects/' || v_project
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists task_comment_notify on public.task_comments;
create trigger task_comment_notify after insert on public.task_comments
  for each row execute function public.on_task_comment();

-- ============ RPC: client approves a deliverable ============
create or replace function public.approve_task(p_task_id uuid)
returns void
set search_path = public
as $$
declare
  v_client uuid;
  v_name text;
  v_company text;
  v_project uuid;
begin
  select client_id into v_client from public.profiles where id = auth.uid();
  if v_client is null then
    return; -- staff approve directly through normal updates
  end if;

  update public.project_tasks t
  set approved_at = now(), approved_by = auth.uid()
  from public.projects p
  where t.id = p_task_id
    and p.id = t.project_id
    and p.client_id = v_client
    and t.approved_at is null;

  if not found then
    return;
  end if;

  select t.name, c.company, t.project_id into v_name, v_company, v_project
  from public.project_tasks t
  join public.projects p on p.id = t.project_id
  join public.clients c on c.id = p.client_id
  where t.id = p_task_id;

  perform public.notify_staff(
    'approval',
    coalesce(v_company, 'Client') || ' approved “' || v_name || '”',
    '/projects/' || v_project
  );
end;
$$ language plpgsql security definer;

grant execute on function public.approve_task(uuid) to authenticated;

-- ============ touch_portal: also notify staff on the first-ever open ============
create or replace function public.touch_portal()
returns void
set search_path = public
as $$
declare
  v_first boolean;
  v_company text;
begin
  select (cp.last_opened_at is null), c.company into v_first, v_company
  from public.client_portals cp
  join public.clients c on c.id = cp.client_id
  where cp.client_id = public.current_client_id()
  limit 1;

  update public.client_portals
  set last_opened_at = now()
  where client_id = public.current_client_id();

  if coalesce(v_first, false) then
    perform public.notify_staff(
      'portal',
      coalesce(v_company, 'A client') || ' opened their portal for the first time',
      '/portals'
    );
  end if;
end;
$$ language plpgsql security definer;

grant execute on function public.touch_portal() to authenticated;

-- ============ RLS ============
alter table public.task_comments enable row level security;
alter table public.portal_updates enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "task_comments_staff_all" on public.task_comments;
create policy "task_comments_staff_all" on public.task_comments for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "task_comments_client_select" on public.task_comments;
create policy "task_comments_client_select" on public.task_comments for select
  using (
    public.current_role_name() = 'client'
    and task_id in (
      select t.id from public.project_tasks t
      join public.projects p on p.id = t.project_id
      where p.client_id = public.current_client_id()
    )
  );

drop policy if exists "task_comments_client_insert" on public.task_comments;
create policy "task_comments_client_insert" on public.task_comments for insert
  with check (
    public.current_role_name() = 'client'
    and author_id = auth.uid()
    and task_id in (
      select t.id from public.project_tasks t
      join public.projects p on p.id = t.project_id
      where p.client_id = public.current_client_id()
    )
  );

drop policy if exists "portal_updates_staff_all" on public.portal_updates;
create policy "portal_updates_staff_all" on public.portal_updates for all
  using (public.current_role_name() in ('admin', 'rep'));

drop policy if exists "portal_updates_client_select" on public.portal_updates;
create policy "portal_updates_client_select" on public.portal_updates for select
  using (public.current_role_name() = 'client' and client_id = public.current_client_id());

drop policy if exists "notifications_own_select" on public.notifications;
create policy "notifications_own_select" on public.notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update
  using (recipient_id = auth.uid());

drop policy if exists "notifications_staff_insert" on public.notifications;
create policy "notifications_staff_insert" on public.notifications for insert
  with check (public.current_role_name() in ('admin', 'rep'));
