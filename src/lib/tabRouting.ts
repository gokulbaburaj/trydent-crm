import type { AppTab } from "./tabs";

/**
 * What should happen to the tab strip when the route changes underneath it.
 *
 * ── The bug this exists to fix ──────────────────────────────────────────────
 *
 * The route can change without going through the tab strip at all: browser
 * back and forward, the TabBar's own arrows, `router.push` from a card, a
 * pasted URL. When that happened the active tab was unconditionally REWRITTEN
 * to the new path.
 *
 * So: open Projects, click a project, press Back. The detail tab gets rewritten
 * into a second "Projects" tab and you're looking at two identical tabs. Do it
 * a few times and the strip fills with duplicates.
 *
 * `go()` already avoided this for sidebar clicks — it focuses an existing tab
 * rather than rewriting the current one. The fix is to apply the same rule to
 * navigation the tab strip didn't initiate, which is every surface at once
 * rather than one page at a time.
 *
 * Pure so it can be tested without a router: the failure mode is a sequence of
 * navigations, and a test can express that where clicking around can't.
 */

export type TabNavigation =
  /** The active tab is already here. Do nothing. */
  | { action: "none" }
  /** Another tab already shows this path — focus it, leave the current one. */
  | { action: "focus"; id: string }
  /** Nowhere else shows this path — the active tab follows the route. */
  | { action: "rewrite" };

export function resolveNavigation(
  tabs: Pick<AppTab, "id" | "href">[],
  activeId: string | null,
  pathname: string
): TabNavigation {
  const active = tabs.find((t) => t.id === activeId);

  // Already showing it. Rewriting would be a no-op and focusing would fight
  // whatever put us here.
  if (active?.href === pathname) return { action: "none" };

  /*
    Focus an existing tab rather than rewriting the current one.

    Excludes the active tab itself — it can't be the one we focus, and the
    `active?.href === pathname` guard above already covered that case.

    First match wins. Duplicate hrefs shouldn't exist once this is in place,
    but the strip is restored from localStorage, which is user-editable and
    outlives any release — so it has to behave sanely if they do.
  */
  const existing = tabs.find((t) => t.href === pathname && t.id !== activeId);
  if (existing) return { action: "focus", id: existing.id };

  return { action: "rewrite" };
}

/**
 * Does this path belong to the same surface as that one?
 *
 * `/projects/abc` belongs to `/projects`. Used to decide whether a detail view
 * should reuse its list's tab or earn its own — NOT used by resolveNavigation,
 * which matches exact paths only.
 *
 * Exported for the tests, and because the answer is less obvious than it looks:
 * a naive `startsWith` says `/project-templates` belongs to `/projects`, and
 * `/clients` belongs to `/client`.
 */
export function isChildPath(child: string, parent: string): boolean {
  if (child === parent) return true;
  return child.startsWith(parent + "/");
}
