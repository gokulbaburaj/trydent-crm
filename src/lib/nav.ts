"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Sidebar layout preferences: which sections are collapsed, the order items
 * were dragged into, and which teams are expanded. Same localStorage +
 * useSyncExternalStore pattern as lib/currency.ts and lib/filters.ts.
 */
export interface NavState {
  /** sectionId → collapsed */
  collapsed: Record<string, boolean>;
  /** sectionId → ordered hrefs */
  order: Record<string, string[]>;
  /** team name → expanded */
  teams: Record<string, boolean>;
}

const KEY = "trydent-nav";
const EVENT = "trydent-nav-change";

const EMPTY: NavState = { collapsed: {}, order: {}, teams: {} };

/** Cache parsed state by raw string so snapshots stay referentially stable. */
let cache: { raw: string | null; value: NavState } | null = null;

function boolMap(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "boolean") out[k] = val;
    }
  }
  return out;
}

function orderMap(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === "string");
    }
  }
  return out;
}

function normalize(v: unknown): NavState {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Record<keyof NavState, unknown>>;
  return {
    collapsed: boolMap(o.collapsed),
    order: orderMap(o.order),
    teams: boolMap(o.teams),
  };
}

function read(): NavState {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      value = normalize(JSON.parse(raw));
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

function write(next: NavState) {
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useNavState() {
  const state = useSyncExternalStore(subscribe, read, () => EMPTY);

  const toggleSection = useCallback((id: string) => {
    const cur = read();
    write({ ...cur, collapsed: { ...cur.collapsed, [id]: !cur.collapsed[id] } });
  }, []);

  const toggleTeam = useCallback((name: string) => {
    const cur = read();
    write({ ...cur, teams: { ...cur.teams, [name]: !cur.teams[name] } });
  }, []);

  const setOrder = useCallback((sectionId: string, hrefs: string[]) => {
    const cur = read();
    write({ ...cur, order: { ...cur.order, [sectionId]: hrefs } });
  }, []);

  const resetLayout = useCallback(() => write(EMPTY), []);

  return { state, toggleSection, toggleTeam, setOrder, resetLayout };
}

/**
 * Apply a saved drag order to a section's items: saved ones first in their
 * chosen order, then anything new that didn't exist when the order was saved.
 */
export function applyOrder<T extends { href: string }>(items: T[], saved: string[] | undefined): T[] {
  if (!saved || saved.length === 0) return items;
  const ranked = saved
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is T => !!i);
  const rest = items.filter((i) => !saved.includes(i.href));
  return [...ranked, ...rest];
}
