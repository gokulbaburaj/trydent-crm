-- key_results.updated_at, so a stalled measure can be noticed.
--
-- ============================================================================
-- Why
-- ============================================================================
--
-- The rebuilt Goals page flags a manual measure nobody has touched in three
-- weeks. That's the failure mode goal tracking actually dies of: not a wrong
-- number, but a number frozen in July that everyone stops trusting and then
-- stops looking at.
--
-- `key_results` only had `created_at`, so "when did this last change" was
-- unanswerable. `goals.updated_at` is the wrong proxy — renaming an objective
-- would mark its measure as freshly updated when the figure hadn't moved.
--
-- Only manual measures are ever flagged. An auto-tracked one reads live data
-- on every render, so its row can be months old and still be current; warning
-- about those would be noise, and noise is how a warning stops meaning
-- anything. That rule lives in `isStalled` in lib/goalPace.ts, not here.
--
-- ============================================================================
-- Backfill
-- ============================================================================
--
-- Existing rows get `created_at`, not `now()`. Defaulting to now() would
-- declare every measure freshly updated at migration time and suppress the
-- warning for three weeks — the one moment the feature would have had
-- something true to say. created_at is the last time we know anything
-- happened to the row, so it's the honest floor.

alter table public.key_results
  add column if not exists updated_at timestamptz not null default now();

update public.key_results
  set updated_at = created_at
  where updated_at > created_at;

-- Reuses public.set_updated_at(), already driving goals and projects.
drop trigger if exists key_results_set_updated_at on public.key_results;
create trigger key_results_set_updated_at
  before update on public.key_results
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Verification
-- ============================================================================
--
--   select name, created_at, updated_at from public.key_results;
--     → updated_at equals created_at on every pre-existing row
--
--   update public.key_results set current_manual = current_manual
--     where id = '<some id>';
--   select name, updated_at from public.key_results where id = '<same id>';
--     → updated_at has moved to now, created_at has not
