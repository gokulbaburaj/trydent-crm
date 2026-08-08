-- ============================================================================
-- Channels: index the foreign keys, and stop re-evaluating auth.uid() per row
-- ============================================================================
--
-- Both problems have the same cause. 2026-07-27t did an RLS performance pass
-- across the app — wrapping helper calls as `(select ...)` so Postgres folds
-- them into a one-time InitPlan instead of calling them once per row. The
-- channels migrations (2026-08-03a/b/c) landed AFTER that pass and never got
-- the treatment. Every unwrapped `auth.uid()` in the database today is in
-- channels, channel_members, messages or message_reactions; nothing else.
--
-- `messages` is hit twice over: `author_id = auth.uid()` evaluated per row,
-- and no index on `author_id`. It's also the only table here that grows
-- without bound, so it's the one that will notice first.
--
-- ── Why ALTER and not DROP/CREATE ────────────────────────────────────────
-- ALTER POLICY swaps the expression in place. DROP + CREATE leaves a window,
-- however brief, where the policy does not exist — and on RLS that window is
-- an open table. The expressions below are semantically identical to what is
-- live now; only the InitPlan wrapping changes.


-- ============================================================================
-- 1. Foreign keys with no supporting index
-- ============================================================================
-- Unindexed, these force a sequential scan of the child table on every join
-- and on every parent delete. Plain CREATE INDEX rather than CONCURRENTLY:
-- these tables are small today and CONCURRENTLY can't run inside the
-- transaction a migration is applied in. Revisit if messages gets large.

create index if not exists idx_channels_client_id           on public.channels (client_id);
create index if not exists idx_channels_created_by          on public.channels (created_by);
create index if not exists idx_channels_project_id          on public.channels (project_id);
create index if not exists idx_message_reactions_profile_id on public.message_reactions (profile_id);
create index if not exists idx_messages_author_id           on public.messages (author_id);


-- ============================================================================
-- 2. auth.uid() folded into an InitPlan
-- ============================================================================

alter policy "channel_members_delete" on public.channel_members
  using (
    (profile_id = (select auth.uid()))
    or (select private.current_is_admin())
  );

alter policy "channel_members_insert" on public.channel_members
  with check (
    (profile_id = (select auth.uid()))
    and (select private.can_see_channel(channel_id))
  );

alter policy "channel_members_update" on public.channel_members
  using (profile_id = (select auth.uid()));

alter policy "channels_delete" on public.channels
  using (
    (select private.current_is_admin())
    or (created_by = (select auth.uid()))
  );

alter policy "channels_insert" on public.channels
  with check (
    ((select private.current_role_name()) <> 'client'::user_role)
    and (select private.current_can('channels'::text))
    and (created_by = (select auth.uid()))
  );

alter policy "channels_update" on public.channels
  using (
    (select private.current_is_admin())
    or (created_by = (select auth.uid()))
  );

alter policy "message_reactions_delete" on public.message_reactions
  using (profile_id = (select auth.uid()));

alter policy "message_reactions_insert" on public.message_reactions
  with check (
    (profile_id = (select auth.uid()))
    and (select private.can_see_channel(
      (select m.channel_id from public.messages m where m.id = message_id)
    ))
  );

alter policy "messages_delete" on public.messages
  using (
    (author_id = (select auth.uid()))
    or (select private.current_is_admin())
  );

alter policy "messages_insert" on public.messages
  with check (
    (select private.can_see_channel(channel_id))
    and (author_id = (select auth.uid()))
  );

alter policy "messages_update" on public.messages
  using (author_id = (select auth.uid()));


-- ============================================================================
-- Verify
-- ============================================================================
--   -- 1. No unwrapped auth.uid() left anywhere.
--   select tablename, policyname from pg_policies
--   where schemaname='public'
--     and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'auth\.(uid|jwt)\(\)'
--     and (coalesce(qual,'')||' '||coalesce(with_check,'')) !~ 'SELECT auth\.(uid|jwt)\(\)';
--   -- expect: 0 rows
--
--   -- 2. Every foreign key now has an index.
--   select c.conrelid::regclass::text, a.attname
--   from pg_constraint c
--   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
--   where c.contype='f' and c.connamespace='public'::regnamespace
--     and array_length(c.conkey,1)=1
--     and not exists (select 1 from pg_index i
--                     where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1]);
--   -- expect: 0 rows
--
--   -- 3. Policy count unchanged — ALTER must not have dropped anything.
--   select count(*) from pg_policies where schemaname='public';
--   -- expect: same as before this migration
