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

export interface AppTab {
  id: string;
  href: string;
  title: string;
}

const STORAGE_KEY = "trydent-tabs";

const PAGE_TITLES: [string, string][] = [
  ["/my-work", "My Work"],
  ["/dashboard", "Dashboard"],
  ["/clients", "Clients"],
  ["/pipeline", "Pipeline"],
  ["/projects", "Projects"],
  ["/schedule", "Schedule"],
  ["/activities", "Schedule"],
  ["/portals", "Client Portals"],
  ["/team", "Team"],
  ["/settings", "Settings"],
];

export function deriveTitle(pathname: string): string {
  if (/^\/projects\/.+/.test(pathname)) return "Project";
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
  newTab: () => void;
  setTitle: (href: string, title: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
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
        } | null;
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

  // Follow in-tab navigation: the active tab tracks the current route.
  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    queueMicrotask(() => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeIdRef.current && t.href !== pathname
            ? { ...t, href: pathname, title: deriveTitle(pathname) }
            : t
        )
      );
    });
  }, [pathname]);

  // Persist.
  useEffect(() => {
    if (!hydrated.current || tabs.length === 0) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
  }, [tabs, activeId]);

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
      const t = { id: rid(), href, title: title ?? deriveTitle(href) };
      setTabs((prev) => [...prev, t]);
      setActiveId(t.id);
      prevPath.current = href;
      router.push(href);
    },
    [router]
  );

  const newTab = useCallback(() => openInNewTab("/dashboard"), [openInNewTab]);

  const close = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
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

  const setTitle = useCallback((href: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.href === href ? { ...t, title } : t)));
  }, []);

  return (
    <TabsContext.Provider
      value={{ tabs, activeId, activate, close, openInNewTab, newTab, setTitle }}
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
