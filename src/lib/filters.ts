"use client";

import { useCallback, useSyncExternalStore } from "react";

/* --------------------------------- Model --------------------------------- */

export interface DueRange {
  /** yyyy-MM-dd or null */
  from: string | null;
  to: string | null;
}

export interface FilterState {
  text: string;
  assignee: string[];
  status: string[];
  label: string[];
  priority: string[];
  due: DueRange;
}

export const EMPTY_FILTERS: FilterState = {
  text: "",
  assignee: [],
  status: [],
  label: [],
  priority: [],
  due: { from: null, to: null },
};

/** Sentinel facet value meaning "no assignee". */
export const UNASSIGNED = "__unassigned__";

export interface SavedView {
  name: string;
  filters: FilterState;
}

export function countActiveFilters(f: FilterState): number {
  return (
    (f.text.trim() ? 1 : 0) +
    f.assignee.length +
    f.status.length +
    f.label.length +
    f.priority.length +
    (f.due.from || f.due.to ? 1 : 0)
  );
}

/** Order-independent signature — used to detect which saved view is active. */
export function filterSignature(f: FilterState): string {
  return JSON.stringify({
    text: f.text.trim().toLowerCase(),
    assignee: [...f.assignee].sort(),
    status: [...f.status].sort(),
    label: [...f.label].sort(),
    priority: [...f.priority].sort(),
    due: [f.due.from, f.due.to],
  });
}

/* ------------------------------ Row matching ------------------------------ */

export interface FilterAccessors<T> {
  /** Strings searched by the free-text filter. */
  text?: (row: T) => (string | null | undefined)[];
  assignee?: (row: T) => string | null;
  status?: (row: T) => string;
  /** All labels/tags on the row. */
  labels?: (row: T) => string[];
  priority?: (row: T) => string;
  /** Date compared by the due-range filter (only the yyyy-MM-dd part is used). */
  due?: (row: T) => string | null;
}

export function applyFilters<T>(
  rows: T[],
  f: FilterState,
  acc: FilterAccessors<T>
): T[] {
  const text = f.text.trim().toLowerCase();
  return rows.filter((row) => {
    if (text && acc.text) {
      const hay = acc.text(row).filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(text)) return false;
    }
    if (f.status.length > 0 && acc.status && !f.status.includes(acc.status(row))) {
      return false;
    }
    if (f.assignee.length > 0 && acc.assignee) {
      const a = acc.assignee(row) ?? UNASSIGNED;
      if (!f.assignee.includes(a)) return false;
    }
    if (f.label.length > 0 && acc.labels) {
      if (!acc.labels(row).some((l) => f.label.includes(l))) return false;
    }
    if (
      f.priority.length > 0 &&
      acc.priority &&
      !f.priority.includes(acc.priority(row))
    ) {
      return false;
    }
    if ((f.due.from || f.due.to) && acc.due) {
      const d = acc.due(row)?.slice(0, 10);
      if (!d) return false;
      if (f.due.from && d < f.due.from) return false;
      if (f.due.to && d > f.due.to) return false;
    }
    return true;
  });
}

/* ------------------ localStorage-backed store (SSR-safe) ------------------ */
/* Same useSyncExternalStore pattern as lib/currency.ts: last-used filters   */
/* auto-persist per page; saved views live alongside under their own key.    */

const EVENT = "trydent-filters-change";
const NO_VIEWS: SavedView[] = [];

/** Parsed values cached by raw string so snapshots stay referentially stable. */
const cache = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function normalizeFilters(v: unknown): FilterState {
  const o = (v && typeof v === "object" ? v : {}) as Partial<
    Record<keyof FilterState, unknown>
  >;
  const due = (o.due && typeof o.due === "object" ? o.due : {}) as Partial<DueRange>;
  return {
    text: typeof o.text === "string" ? o.text : "",
    assignee: strArray(o.assignee),
    status: strArray(o.status),
    label: strArray(o.label),
    priority: strArray(o.priority),
    due: {
      from: typeof due.from === "string" ? due.from : null,
      to: typeof due.to === "string" ? due.to : null,
    },
  };
}

function normalizeViews(v: unknown): SavedView[] {
  if (!Array.isArray(v)) return NO_VIEWS;
  const out: SavedView[] = [];
  for (const item of v) {
    const o = item as { name?: unknown; filters?: unknown };
    if (o && typeof o.name === "string" && o.name) {
      out.push({ name: o.name, filters: normalizeFilters(o.filters) });
    }
  }
  return out;
}

function readCached<T>(key: string, parse: (v: unknown) => T, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  if (raw) {
    try {
      value = parse(JSON.parse(raw));
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Per-page filters + saved views, persisted in localStorage.
 * `pageKey` examples: "clients", "pipeline", "project-tasks", "schedule".
 */
export function useStoredFilters(pageKey: string) {
  const filtersKey = `trydent-filters:${pageKey}`;
  const viewsKey = `trydent-views:${pageKey}`;

  const filters = useSyncExternalStore(
    subscribe,
    () => readCached(filtersKey, normalizeFilters, EMPTY_FILTERS),
    () => EMPTY_FILTERS
  );
  const views = useSyncExternalStore(
    subscribe,
    () => readCached(viewsKey, normalizeViews, NO_VIEWS),
    () => NO_VIEWS
  );

  const setFilters = useCallback(
    (f: FilterState) => write(filtersKey, f),
    [filtersKey]
  );
  const setViews = useCallback(
    (v: SavedView[]) => write(viewsKey, v),
    [viewsKey]
  );

  return { filters, views, setFilters, setViews };
}
