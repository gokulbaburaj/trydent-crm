"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Load every row of a table, with a shared stale-while-revalidate cache.
 *
 * Why the cache exists
 * --------------------
 * This hook used to start from an empty array and fetch on every mount. A page
 * like Projects calls it four times (projects, clients, profiles, tasks), so
 * every visit meant four round trips before anything could render — and going
 * back to a page you'd just left repeated all four. That's what made the app
 * feel slow; it was never the animations.
 *
 * Now the first render reads synchronously from a module-level cache. If you've
 * loaded the table before in this session the page paints immediately with the
 * previous rows, and a refetch runs in the background to correct them. Only a
 * genuine cold load shows an empty state.
 *
 * In-flight requests are de-duplicated by key, so four components asking for
 * `profiles` in the same tick share one network call instead of racing.
 *
 * The cache lives for the page session only — a refresh clears it. That's
 * deliberate: it keeps the invalidation story simple (mount = revalidate) and
 * there's nothing to go stale across reloads.
 */

type CacheEntry = { rows: unknown[]; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown[]>>();

/** Clear everything — call after an action that changes many tables at once. */
export function clearTableCache(table?: string) {
  if (!table) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(table + "|")) cache.delete(key);
  }
}

/**
 * The row count at which whole-table fetching stops being the right call.
 *
 * Not a hard limit and not enforced — a tripwire. Below this, one cached round
 * trip beats a paged query on every measure that matters: it's faster, the
 * client can filter and sort instantly, and saved views work without a server
 * round trip per keystroke.
 *
 * 1,000 is where that inverts for a table of this shape (a few hundred bytes a
 * row, rendered fifteen at a time). Largest table today is 26 rows, so this is
 * years away — which is exactly why it needs to shout rather than be
 * remembered.
 */
const LARGE_TABLE_ROWS = 1000;

const warned = new Set<string>();

function warnIfLarge(table: string, rows: number) {
  if (rows < LARGE_TABLE_ROWS || warned.has(table)) return;
  warned.add(table);
  // Dev only. In production this would be noise in a console nobody reads;
  // the fix is a code change, and code changes happen in development.
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[useSupabaseTable] "${table}" returned ${rows} rows and is fetched whole ` +
        `on every page that uses it. Past ~${LARGE_TABLE_ROWS} rows this needs ` +
        `server-side pagination — and filtering and sorting have to move with ` +
        `it, or filters will silently apply to one page. ` +
        `See docs/plan-server-pagination.md.`
    );
  }
}

export function useSupabaseTable<T>(
  table: string,
  orderBy?: { column: string; ascending?: boolean }
) {
  // Primitives, not the object — the caller rebuilds `orderBy` every render, so
  // depending on it directly would rebuild refetch every render too.
  const orderColumn = orderBy?.column;
  const orderAsc = orderBy?.ascending ?? true;
  const key = `${table}|${orderColumn ?? ""}|${orderAsc}`;

  const [rows, setRowsState] = useState<T[]>(
    () => (cache.get(key)?.rows as T[] | undefined) ?? []
  );
  // Only a cold table blocks on a spinner. A warm one renders its last known
  // rows and revalidates quietly underneath.
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let request = inflight.get(key);
    if (!request) {
      request = (async () => {
        let query = supabase.from(table).select("*");
        if (orderColumn) {
          query = query.order(orderColumn, { ascending: orderAsc });
        }
        const { data, error: err } = await query;
        if (err) throw new Error(err.message);
        const rows = (data as unknown[]) ?? [];
        warnIfLarge(table, rows.length);
        return rows;
      })();
      inflight.set(key, request);
      // Whatever happens, the slot must free up or the table is stuck forever.
      request.finally(() => inflight.delete(key));
    }

    try {
      const data = await request;
      cache.set(key, { rows: data, fetchedAt: Date.now() });
      setRowsState(data as T[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key, table, orderColumn, orderAsc]);

  useEffect(() => {
    queueMicrotask(() => {
      refetch();
    });
  }, [refetch]);

  /**
   * Optimistic updates write through to the cache, so a row you just edited is
   * still edited when you navigate away and come back before the next fetch.
   * Done in an effect rather than inside the state updater — updaters can run
   * during render and must stay pure.
   */
  useEffect(() => {
    const entry = cache.get(key);
    // Only once there's a real entry; otherwise the initial empty array would
    // masquerade as a loaded result and suppress the first fetch's spinner.
    if (entry) cache.set(key, { rows: rows as unknown[], fetchedAt: entry.fetchedAt });
  }, [rows, key]);

  return { rows, loading, error, refetch, setRows: setRowsState };
}
