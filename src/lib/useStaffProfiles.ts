"use client";

import { useMemo } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import type { Profile } from "@/lib/types";

/**
 * Profiles that belong to the team, never portal logins.
 *
 * Every client with a portal has a `profiles` row, so a raw profiles query used
 * to fill an "assign to" menu offers up your customers as if they were staff.
 * Any people picker should read from here instead.
 *
 * Sorted by name, and de-duplicated by id so a picker can't show the same
 * person twice.
 */
export function useStaffProfiles() {
  const { rows, setRows, loading } = useSupabaseTable<Profile>("profiles");

  const staff = useMemo(() => {
    const byId = new Map<string, Profile>();
    for (const p of rows) {
      if (p.role === "client") continue;
      byId.set(p.id, p);
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.full_name ?? "").localeCompare(b.full_name ?? "")
    );
  }, [rows]);

  return { rows: staff, allRows: rows, setRows, loading };
}
