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
