"use client";

import { useCallback, useState } from "react";

/**
 * Which view a page opens in.
 *
 * Every page with a Board / List / Calendar toggle previously hardcoded its
 * starting view, so someone who lives in the Recruiting list had to click over
 * to it every single time. The preference is per person and per page: a
 * recruiter's default has nothing to do with a designer's.
 *
 * localStorage rather than the database, deliberately. It's a UI preference,
 * not data — losing it costs one click, and putting it in Postgres would mean
 * a round trip before the page can decide what to render, which shows up as a
 * flash of the wrong view. The tab bar and currency picker already work this
 * way.
 *
 * The initial read happens in a lazy useState initialiser so the first paint is
 * already correct — reading it in an effect would render the fallback, then
 * swap, which is the flash we're avoiding.
 */

const PREFIX = "trydent-view:";

export interface ViewOption<T extends string> {
  id: T;
  label: string;
}

/** Pages that expose a default-view choice, for the Settings picker. */
export const VIEW_PREFERENCES = [
  {
    key: "clients",
    label: "Clients",
    options: [
      { id: "table", label: "Table" },
      { id: "kanban", label: "Board" },
      { id: "focus", label: "Focus" },
    ],
    fallback: "table",
  },
  {
    key: "projects",
    label: "Projects",
    options: [
      { id: "table", label: "Table" },
      { id: "grouped", label: "By client" },
      { id: "focus", label: "Focus" },
    ],
    fallback: "table",
  },
  {
    key: "pipeline",
    label: "Pipeline",
    options: [
      { id: "table", label: "Table" },
      { id: "board", label: "Board" },
      { id: "focus", label: "Focus" },
    ],
    fallback: "table",
  },
  {
    key: "recruiting",
    label: "Recruiting",
    options: [
      { id: "board", label: "Board" },
      { id: "list", label: "List" },
    ],
    fallback: "board",
  },
  {
    key: "team",
    label: "Team",
    options: [
      { id: "members", label: "Members" },
      { id: "org", label: "Org chart" },
    ],
    fallback: "members",
  },
  {
    key: "project",
    label: "Project detail",
    options: [
      { id: "overview", label: "Overview" },
      { id: "board", label: "Kanban" },
      { id: "tasks", label: "List" },
      { id: "calendar", label: "Calendar" },
    ],
    fallback: "overview",
  },
] as const;

/**
 * The order the Settings picker lists these in, when someone has dragged them.
 *
 * Same storage story as the preferences themselves — it's a per-device UI
 * choice, so it sits in localStorage next to them rather than in Postgres.
 * Stored as keys, not indexes: an index list silently reorders everything the
 * day a new preference is added to VIEW_PREFERENCES.
 */
const ORDER_KEY = "trydent-view-order";

export function readViewOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function writeViewOrder(keys: string[]) {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

/**
 * VIEW_PREFERENCES in the saved order: known keys first as arranged, then
 * anything added to the list since the order was saved.
 *
 * Mirrors `applyOrder` in lib/nav.ts deliberately — an unknown key must never
 * drop a row, it just lands at the end.
 */
export function orderedViewPreferences(saved: string[]) {
  const all = [...VIEW_PREFERENCES];
  if (saved.length === 0) return all;

  // Deduped as it's read. localStorage is user-editable and survives across
  // versions, so a repeated key is a real possibility — and a naive map/filter
  // renders that preference twice, which is a duplicate React key, not just a
  // cosmetic repeat. `lib/nav.ts` applyOrder has the same shape and the same
  // fix.
  const seen = new Set<string>();
  const ranked: (typeof all)[number][] = [];
  for (const key of saved) {
    if (seen.has(key)) continue;
    const found = all.find((p) => p.key === key);
    if (!found) continue; // a preference that no longer exists
    seen.add(key);
    ranked.push(found);
  }
  const rest = all.filter((p) => !seen.has(p.key));
  return [...ranked, ...rest];
}

export function readViewPreference<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return (window.localStorage.getItem(PREFIX + key) as T) || fallback;
  } catch {
    // Private browsing, or storage disabled. Not worth failing a page render.
    return fallback;
  }
}

export function writeViewPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}

/**
 * Page-local view state seeded from the saved default.
 *
 * Changing the view during a session does NOT rewrite the default — that's
 * what the Settings picker is for. Otherwise glancing at the org chart once
 * silently changes where Team opens forever, and preferences that change
 * themselves are impossible to reason about.
 */
export function useViewPreference<T extends string>(key: string, fallback: T) {
  const [view, setView] = useState<T>(() => readViewPreference(key, fallback));
  const set = useCallback((next: T) => setView(next), []);
  return [view, set] as const;
}
