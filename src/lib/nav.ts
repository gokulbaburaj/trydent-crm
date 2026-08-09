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
  /**
   * The whole rail collapsed to icons.
   *
   * Separate from `collapsed`, which is per-section. Folding the rail is a
   * different intent — it's about reclaiming ~180px for the record pane, not
   * about hiding a group you don't use — and conflating them would mean
   * un-collapsing the rail silently expanded every section you'd closed.
   */
  rail: boolean;
}

const KEY = "trydent-nav";
const EVENT = "trydent-nav-change";

const EMPTY: NavState = { collapsed: {}, order: {}, teams: {}, rail: false };

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
    rail: o.rail === true,
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

  /**
   * Accordion, not checkboxes: opening a team closes the others.
   *
   * Each team expands to three sub-links, so with five teams open the sidebar
   * became twenty rows and the sections below it were pushed off screen. You
   * are only ever looking at one team at a time, and the collapse is the thing
   * that makes the rest of the nav reachable.
   */
  const toggleTeam = useCallback((name: string) => {
    const cur = read();
    const wasOpen = !!cur.teams[name];
    write({ ...cur, teams: wasOpen ? {} : { [name]: true } });
  }, []);

  /**
   * Open a team without the toggle behaviour.
   *
   * Clicking a team's NAME navigates to its dashboard, and the sidebar should
   * follow you there — expanded, with the others closed. `toggleTeam` would be
   * wrong for that: clicking the name of the team you're already looking at
   * would collapse it out from under you.
   */
  const openTeam = useCallback((name: string) => {
    const cur = read();
    if (cur.teams[name] && Object.keys(cur.teams).length === 1) return;
    write({ ...cur, teams: { [name]: true } });
  }, []);

  const setOrder = useCallback((sectionId: string, hrefs: string[]) => {
    const cur = read();
    write({ ...cur, order: { ...cur.order, [sectionId]: hrefs } });
  }, []);

  const toggleRail = useCallback(() => {
    const cur = read();
    write({ ...cur, rail: !cur.rail });
  }, []);

  const resetLayout = useCallback(() => write(EMPTY), []);

  return { state, toggleSection, toggleTeam, openTeam, setOrder, toggleRail, resetLayout };
}

/**
 * Apply a saved drag order to a section's items: saved ones first in their
 * chosen order, then anything new that didn't exist when the order was saved.
 *
 * Deduped as it's read. This order lives in localStorage, which is
 * user-editable and outlives any given release, so a repeated href is a real
 * possibility — and the naive map/filter version rendered that nav item twice
 * under the same React key. Found by the test on the equivalent function in
 * `lib/useViewPreference.ts`; the same shape had the same hole here.
 */
export function applyOrder<T extends { href: string }>(items: T[], saved: string[] | undefined): T[] {
  if (!saved || saved.length === 0) return items;
  const seen = new Set<string>();
  const ranked: T[] = [];
  for (const href of saved) {
    if (seen.has(href)) continue;
    const found = items.find((i) => i.href === href);
    if (!found) continue; // an item that no longer exists in this section
    seen.add(href);
    ranked.push(found);
  }
  const rest = items.filter((i) => !seen.has(i.href));
  return [...ranked, ...rest];
}
