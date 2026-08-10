-- Keep key_results.current_manual equal to the sum of its contributions.
--
-- ============================================================================
-- Why a trigger rather than deleting the column
-- ============================================================================
--
-- 11c made contributions the thing you enter. The obvious next step is to
-- delete `current_manual` and have every reader sum the log instead — and
-- that's wrong here, for a reason worth writing down.
--
-- `currentValue` in lib/goals.ts is read by the Goals page, the Dashboard and
-- the Organisation hub, through a `MetricSources` bundle that carries deals,
-- clients, tasks and invoices. Threading contributions through all three call
-- sites turns a Goals change into a three-page change, and every one of those
-- pages would then fetch a table it otherwise has no use for.
--
-- So the column stays and becomes a CACHE, maintained by the database. That
-- is a different thing from the duplicated state this whole rework has been
-- removing: nothing writes it by hand, it cannot drift, and there's exactly
-- one place — here — where the rule lives.
--
-- A useful side effect: because the recompute UPDATEs key_results, the
-- existing `key_results_set_updated_at` trigger fires, so `updated_at` now
-- means "when did progress last move" rather than "when did anyone touch this
-- row". That's precisely the question `isStalled` is asking.
--
-- ============================================================================
-- Correctness notes
-- ============================================================================
--
-- SECURITY DEFINER: a contributor may hold the `goals` grant while the
-- recompute writes to key_results. Running as the owner keeps the cache
-- correct regardless of who inserted the row; the insert itself is still
-- gated by the RLS policy on goal_contributions.
--
-- The DELETE case must read OLD, not NEW — NEW is null there, and reading it
-- would leave the cache stale on exactly the operation this exists to handle
-- (removing a wrong entry and expecting the total to correct itself).
--
-- coalesce(..., 0) because deleting the last contribution makes sum() null,
-- and `current_manual` is NOT NULL.

create or replace function public.sync_current_manual()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_kr uuid;
begin
  v_kr := coalesce(new.key_result_id, old.key_result_id);

  update public.key_results k
  set current_manual = coalesce(
    (select sum(c.amount) from public.goal_contributions c where c.key_result_id = v_kr),
    0
  )
  where k.id = v_kr;

  return coalesce(new, old);
end;
$$;

drop trigger if exists goal_contributions_sync on public.goal_contributions;
create trigger goal_contributions_sync
  after insert or update or delete on public.goal_contributions
  for each row execute function public.sync_current_manual();

-- ============================================================================
-- Verification — run all three, in order
-- ============================================================================
--
--   -- 1. insert adds
--   insert into public.goal_contributions (key_result_id, amount, note)
--     values ('<a manual kr id>', 100, 'trigger test');
--   select current_manual from public.key_results where id = '<same>';
--
--   -- 2. delete removes it again
--   delete from public.goal_contributions where note = 'trigger test';
--   select current_manual from public.key_results where id = '<same>';
--
--   -- 3. nothing drifted
--   select k.name, k.current_manual, coalesce(sum(c.amount), 0) as logged
--   from public.key_results k
--   left join public.goal_contributions c on c.key_result_id = k.id
--   where k.source = 'manual' group by k.id, k.name, k.current_manual;
