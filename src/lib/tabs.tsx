"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveNavigation } from "@/lib/tabRouting";

export interface AppTab {
  id: string;
  href: string;
  title: string;
}

const STORAGE_KEY = "trydent-tabs";

/** How many closed tabs the History list remembers. */
const CLOSED_LIMIT = 12;

const PAGE_TITLES: [string, string][] = [
  ["/my-work", "My Work"],
  ["/dashboard", "Dashboard"],
  ["/clients", "Clients"],
  ["/invoices", "Invoices"],
  ["/pipeline", "Pipeline"],
  ["/projects", "Projects"],
  ["/schedule", "Schedule"],
  ["/channels", "Channels"],
  ["/activities", "Schedule"],
  ["/organization", "Organisation"],
  ["/payouts", "Payouts"],
  ["/goals", "Goals"],
  ["/recruiting", "Recruiting"],
  ["/onboarding", "Onboarding"],
  ["/team", "Team"],
  ["/settings", "Settings"],
];

export function deriveTitle(pathname: string): string {
  if (/^\/projects\/.+/.test(pathname)) return "Project";
  if (/^\/clients\/.+/.test(pathname)) return "Client";
  const match = PAGE_TITLES.find(([k]) => pathname === k || pathname.startsWith(k + "/"));
  return match ? match[1] : "Trydent Labs";
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

interface TabsContextValue {
  tabs: AppTab[];
  activeId: string | null;
  activate: (id: string) => void;
  close: (id: string) => void;
  openInNewTab: (href: string, title?: string) => void;
  /** Sidebar navigation: focuses an already-open tab for this href. Returns
   *  true when it did, so the caller can suppress the default link. */
  go: (href: string) => boolean;
  newTab: () => void;
  setTitle: (href: string, title: string) => void;
  /** Tabs you closed, most recent first. Capped — see CLOSED_LIMIT. */
  recentlyClosed: AppTab[];
  /** Reopen a closed tab. With no argument, reopens the most recent one. */
  reopen: (id?: string) => void;
  clearRecentlyClosed: () => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [recentlyClosed, setRecentlyClosed] = useState<AppTab[]>([]);
  const hydrated = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const prevPath = useRef(pathname);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Hydrate from localStorage once (deferred to avoid a synchronous cascading render).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as {
          tabs: AppTab[];
          activeId: string;
          closed?: AppTab[];
        } | null;
        if (saved?.closed?.length) setRecentlyClosed(saved.closed.slice(0, CLOSED_LIMIT));
        if (saved?.tabs?.length) {
          const active = saved.tabs.find((t) => t.id === saved.activeId) ?? saved.tabs[0];
          const synced = saved.tabs.map((t) =>
            t.id === active.id ? { ...t, href: pathname, title: deriveTitle(pathname) } : t
          );
          setTabs(synced);
          setActiveId(active.id);
          activeIdRef.current = active.id;
          return;
        }
      } catch {
        // fall through to a fresh tab
      }
      const t = { id: rid(), href: pathname, title: deriveTitle(pathname) };
      setTabs([t]);
      setActiveId(t.id);
      activeIdRef.current = t.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Follow navigation the tab strip didn't initiate.
   *
   * Browser back and forward, the TabBar arrows, a `router.push` from a card,
   * a pasted URL — none of these go through `go()` or `openInNewTab`.
   *
   * This used to rewrite the active tab onto the new path unconditionally,
   * which duplicated tabs on every back-out of a detail view: open Projects,
   * click a project, press Back, and the detail tab became a SECOND "Projects"
   * tab beside the one already open. A few rounds of that and the strip is
   * nothing but duplicates. Reported from the Projects page, but this effect
   * governs every surface, so it was happening on all of them.
   *
   * `resolveNavigation` applies the rule `go()` already used for the sidebar:
   * if another tab is showing this path, focus it and leave the current tab
   * alone. Only rewrite when nothing else is showing it.
   */
  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    queueMicrotask(() => {
      setTabs((prev) => {
        const decision = resolveNavigation(prev, activeIdRef.current, pathname);

        if (decision.action === "none") return prev;

        if (decision.action === "focus") {
          // Focus only. The tab we're leaving keeps its href, so the detail
          // view is still there when you want it back.
          setActiveId(decision.id);
          activeIdRef.current = decision.id;
          return prev;
        }

        return prev.map((t) =>
          t.id === activeIdRef.current
            ? { ...t, href: pathname, title: deriveTitle(pathname) }
            : t
        );
      });
    });
  }, [pathname]);

  // Persist.
  useEffect(() => {
    if (!hydrated.current || tabs.length === 0) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tabs, activeId, closed: recentlyClosed })
    );
  }, [tabs, activeId, recentlyClosed]);

  const activate = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === id);
        if (tab) {
          setActiveId(id);
          prevPath.current = tab.href;
          router.push(tab.href);
        }
        return prev;
      });
    },
    [router]
  );

  const openInNewTab = useCallback(
    (href: string, title?: string) => {
      // Clicking the same project five times used to open five identical tabs.
      // If one is already showing this href, focus it instead — that's what
      // every browser does, and it's what people expect.
      setTabs((prev) => {
        const existing = prev.find((t) => t.href === href);
        if (existing) {
          setActiveId(existing.id);
          prevPath.current = href;
          router.push(href);
          return prev;
        }
        const t = { id: rid(), href, title: title ?? deriveTitle(href) };
        setActiveId(t.id);
        prevPath.current = href;
        router.push(href);
        return [...prev, t];
      });
    },
    [router]
  );

  /**
   * Sidebar navigation.
   *
   * A plain <Link> changes the route, and the active tab follows it — so
   * clicking "Organisation" while sitting on a Team tab REWROTE that tab into a
   * second Organisation tab, even though one was already open. Focus the
   * existing tab when there is one; otherwise navigate normally.
   *
   * Returns true when it handled the click, so the caller can preventDefault.
   */
  const go = useCallback(
    (href: string) => {
      let handled = false;
      setTabs((prev) => {
        const existing = prev.find((t) => t.href === href);
        if (existing && existing.id !== activeIdRef.current) {
          handled = true;
          setActiveId(existing.id);
          prevPath.current = href;
          router.push(href);
        }
        return prev;
      });
      return handled;
    },
    [router]
  );

  const newTab = useCallback(() => openInNewTab("/dashboard"), [openInNewTab]);

  const close = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        // Remember it so History can put it back. Same href twice in the list
        // is noise, so the older entry drops out.
        const gone = prev[idx];
        setRecentlyClosed((seen) =>
          [gone, ...seen.filter((t) => t.href !== gone.href)].slice(0, CLOSED_LIMIT)
        );
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const fresh = { id: rid(), href: "/dashboard", title: "Dashboard" };
          setActiveId(fresh.id);
          prevPath.current = fresh.href;
          router.push(fresh.href);
          return [fresh];
        }
        if (activeIdRef.current === id) {
          const neighbor = next[Math.min(idx, next.length - 1)];
          setActiveId(neighbor.id);
          prevPath.current = neighbor.href;
          router.push(neighbor.href);
        }
        return next;
      });
    },
    [router]
  );

  /**
   * Put a closed tab back. Goes through openInNewTab, so reopening something
   * that's since been opened again focuses the existing tab rather than
   * duplicating it.
   */
  const reopen = useCallback(
    (id?: string) => {
      const tab = id ? recentlyClosed.find((t) => t.id === id) : recentlyClosed[0];
      if (!tab) return;
      setRecentlyClosed((prev) => prev.filter((t) => t.id !== tab.id));
      openInNewTab(tab.href, tab.title);
    },
    [recentlyClosed, openInNewTab]
  );

  const clearRecentlyClosed = useCallback(() => setRecentlyClosed([]), []);

  const setTitle = useCallback((href: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.href === href ? { ...t, title } : t)));
  }, []);

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeId,
        activate,
        close,
        openInNewTab,
        go,
        newTab,
        setTitle,
        recentlyClosed,
        reopen,
        clearRecentlyClosed,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useTabs must be used inside TabsProvider");
  return ctx;
}
