"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Generic hook to load all rows from a table and expose a refetch fn.
 * Safe against missing Supabase config (returns empty array).
 */
export function useSupabaseTable<T>(table: string, orderBy?: { column: string; ascending?: boolean }) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase.from(table).select("*");
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setRows((data as T[]) ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  useEffect(() => {
    queueMicrotask(() => {
      refetch();
    });
  }, [refetch]);

  return { rows, loading, error, refetch, setRows };
}
