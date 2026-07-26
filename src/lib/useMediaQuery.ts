"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe media query subscription.
 *
 * useSyncExternalStore rather than the usual useEffect + setState pair: it
 * gives React a snapshot to read during render, so there's no flash of the
 * desktop layout before the effect runs, and it doesn't trip the
 * `react-hooks/set-state-in-effect` rule this project enforces.
 *
 * The server snapshot is always `false` — the server has no viewport, so we
 * render the desktop tree and let hydration correct it on phones.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** True below Tailwind's `sm` breakpoint, i.e. phones held upright. */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
