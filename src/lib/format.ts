/**
 * App formatting + motion helpers.
 *
 * These deliberately live OUTSIDE `lib/utils.ts`: that file is owned by the
 * shadcn CLI (it's the `utils` alias in components.json), so every
 * `npx shadcn@latest add ...` overwrites it with the stock `cn`-only version.
 * Keeping our helpers here means installs can never break the build again.
 */

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * What `document.startViewTransition` actually returns.
 *
 * This used to be typed `(cb: () => void) => void`, and that single wrong
 * annotation is what hid the bug below for weeks: if the function returns
 * nothing, there are no promises, and if there are no promises there is
 * nothing to catch.
 */
interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

/**
 * Run a state update inside a View Transition when the browser supports it —
 * elements with a `view-transition-name` morph smoothly to their new position
 * instead of jumping. Falls back to an instant update.
 *
 * ── The InvalidStateError ───────────────────────────────────────────────────
 *
 * `startViewTransition` returns an object whose `ready` and `finished`
 * promises REJECT when the transition is skipped rather than completed. The
 * spec skips a transition when a second one starts while the first is still
 * running, and when the document isn't visible — both of which happen here
 * constantly: drag an event on the schedule and drop it before the ~250ms
 * animation ends, or switch tabs mid-transition.
 *
 * Nothing attached a `.catch`, so every skip became
 * `unhandledRejection: InvalidStateError: Transition was aborted because of
 * invalid state`. It logged on every page load in dev, it logs in production,
 * and in dev it was severe enough to make Fast Refresh give up and do a full
 * reload — which is the reload-the-world behaviour that has been blamed on
 * Turbopack for a while.
 *
 * Skipping is normal operation, not a failure: the DOM update still happens,
 * only the animation is dropped. So these rejections are swallowed rather than
 * reported. Anything that is NOT a skip is re-thrown, because a real fault in
 * the update callback must not be silently eaten.
 */
export function withViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => ViewTransitionLike;
  };
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof doc.startViewTransition !== "function" || reduced) {
    update();
    return;
  }

  const transition = doc.startViewTransition(update);

  // `finished` covers both — it rejects for the same reasons `ready` does, and
  // attaching to only one of the two still leaves the other unhandled.
  for (const promise of [transition.ready, transition.finished]) {
    promise.catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      // AbortError is the same story under a different name in some engines.
      if (name === "InvalidStateError" || name === "AbortError") return;
      throw err;
    });
  }
}

export function initials(name: string | null | undefined) {
  // Trim before the emptiness check, not after: a whitespace-only name is
  // truthy, so the old guard let it through and `"".slice(0, 2)` returned an
  // empty string — a blank hole in the avatar circle rather than a fallback.
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
