"use client";

import { useCallback, useMemo } from "react";
import { toast } from "@/components/Toaster";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useAuth } from "@/lib/useAuth";
import { isAdmin as hasAdminRights } from "@/lib/permissions";
import type { Resource, ResourceKind } from "@/lib/types";

/**
 * Everything the Resources pages need.
 *
 * Reads lean on `useSupabaseTable`, so this inherits its cache, its
 * request de-duplication and its known limit: the whole table comes down in one
 * go. At the size this will be — tens of notes, maybe hundreds — that's the
 * right trade, and it's the same standing item the audit already tracks for
 * every other list in the app.
 *
 * Writes are admin-only and the database agrees (see the RLS in
 * 2026-08-01a_resources.sql). `canEdit` here is for hiding buttons; it is not
 * what stops a non-admin writing.
 */

export interface ResourceDraft {
  kind: ResourceKind;
  title: string;
  summary?: string | null;
  body?: string | null;
  url?: string | null;
  tags?: string[];
  client_id?: string | null;
  project_id?: string | null;
}

export function useResources() {
  const { profile, access } = useAuth();
  const canEdit = hasAdminRights(access);

  const { rows, loading, error, setRows, refetch } = useSupabaseTable<Resource>(
    "resources",
    { column: "updated_at", ascending: false }
  );

  /** Pinned first, then most recently touched. Sorted here so every consumer
   *  gets the same order without repeating the comparator. */
  const resources = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      }),
    [rows]
  );

  /** Every tag in use, with a count, most-used first — that's the order a
   *  filter row wants, not alphabetical. */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }, [rows]);

  const create = useCallback(
    async (draft: ResourceDraft): Promise<Resource | null> => {
      const supabase = createClient();
      if (!supabase) return null;

      const payload = {
        kind: draft.kind,
        title: draft.title.trim(),
        summary: draft.summary?.trim() || null,
        // A note starts with a placeholder rather than null: the shape
        // constraint rejects an empty note, and "" is what a fresh editor
        // hands back. Better a one-line stub than a failed insert.
        body: draft.kind === "note" ? (draft.body?.trim() || "Start writing…") : null,
        url: draft.kind === "link" ? normaliseUrl(draft.url ?? "") : null,
        tags: draft.tags ?? [],
        client_id: draft.client_id ?? null,
        project_id: draft.project_id ?? null,
        created_by: profile?.id ?? null,
      };

      const { data, error: err } = await supabase
        .from("resources")
        .insert(payload)
        .select()
        .single();

      if (err) {
        toast.error(`Couldn't create: ${err.message}`);
        return null;
      }
      const row = data as Resource;
      setRows((prev) => [row, ...prev]);
      return row;
    },
    [profile, setRows]
  );

  const update = useCallback(
    async (id: string, patch: Partial<Resource>) => {
      const before = rows.find((r) => r.id === id);
      // Optimistic: the editor should feel like a text box, not a form.
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

      const supabase = createClient();
      if (!supabase) return;
      const { error: err } = await supabase.from("resources").update(patch).eq("id", id);
      if (err) {
        toast.error(`Couldn't save: ${err.message}`);
        // Put it back. A silent failure on a permissions change is the worst
        // possible failure on this particular table.
        if (before) setRows((prev) => prev.map((r) => (r.id === id ? before : r)));
      }
    },
    [rows, setRows]
  );

  const remove = useCallback(
    async (id: string) => {
      const before = rows.find((r) => r.id === id);
      setRows((prev) => prev.filter((r) => r.id !== id));

      const supabase = createClient();
      if (!supabase) return;
      const { error: err } = await supabase.from("resources").delete().eq("id", id);
      if (err) {
        toast.error(`Couldn't delete: ${err.message}`);
        if (before) setRows((prev) => [before, ...prev]);
      }
    },
    [rows, setRows]
  );

  return { resources, tagCounts, loading, error, canEdit, create, update, remove, refetch };
}

/**
 * `trydent.xyz` typed into a URL field is a URL, and `href="trydent.xyz"`
 * resolves against the current origin and 404s. Prefix it rather than making
 * the person remember the scheme.
 */
export function normaliseUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith("mailto:")) return url;
  return `https://${url}`;
}

/** Hostname for display, falling back to the raw string if it won't parse. */
export function urlHost(raw: string | null): string {
  if (!raw) return "";
  try {
    return new URL(normaliseUrl(raw)).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}
