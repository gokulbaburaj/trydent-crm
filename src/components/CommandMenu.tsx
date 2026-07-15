"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  MonitorSmartphone,
  Palette,
  Search,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useTabs } from "@/lib/tabs";
import { ACCENT_PRESETS, setAccent } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { Client, Deal, Project } from "@/lib/types";

export const OPEN_COMMAND_MENU = "trydent-open-command-menu";

/** Open the ⌘K menu from anywhere (e.g. the topbar search box). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_COMMAND_MENU));
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

const PAGES: { href: string; label: string; icon: Item["icon"] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/portals", label: "Client Portals", icon: MonitorSmartphone },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function CommandMenu() {
  const router = useRouter();
  const { openInNewTab } = useTabs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: deals } = useSupabaseTable<Deal>("deals");

  const show = useCallback(() => {
    setQuery("");
    setIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_MENU, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_MENU, onOpen);
    };
  }, [show]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const go = (href: string) => {
      setOpen(false);
      router.push(href);
    };

    const pages: Item[] = PAGES.filter((p) => match(p.label)).map((p) => ({
      id: `page-${p.href}`,
      label: p.label,
      hint: "Page",
      icon: p.icon,
      run: () => go(p.href),
    }));

    const clientItems: Item[] = clients
      .filter((c) => match(c.company) || match(c.point_person ?? ""))
      .slice(0, q ? 6 : 3)
      .map((c) => ({
        id: `client-${c.id}`,
        label: c.company,
        hint: c.status,
        icon: Users,
        run: () => go("/clients"),
      }));

    const projectItems: Item[] = projects
      .filter((p) => match(p.name))
      .slice(0, q ? 6 : 3)
      .map((p) => ({
        id: `project-${p.id}`,
        label: p.name,
        hint: "Project",
        icon: FolderKanban,
        run: () => {
          setOpen(false);
          openInNewTab(`/projects/${p.id}`, p.name);
        },
      }));

    const dealItems: Item[] = deals
      .filter((d) => match(d.deal_name))
      .slice(0, q ? 6 : 3)
      .map((d) => ({
        id: `deal-${d.id}`,
        label: d.deal_name,
        hint: d.deal_stage,
        icon: GitBranch,
        run: () => go("/pipeline"),
      }));

    const themeItems: Item[] = ACCENT_PRESETS.filter((p) =>
      match(`theme ${p.name}`)
    ).map((p) => ({
      id: `theme-${p.accent}`,
      label: `Theme: ${p.name}`,
      hint: "Action",
      icon: Palette,
      run: () => {
        setAccent(p.accent);
        setOpen(false);
      },
    }));

    return [
      { label: "Pages", items: pages },
      { label: "Clients", items: clientItems },
      { label: "Projects", items: projectItems },
      { label: "Deals", items: dealItems },
      { label: "Theme", items: q ? themeItems : [] },
    ].filter((g) => g.items.length > 0);
  }, [query, clients, projects, deals, router, openInNewTab]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const clampedIndex = Math.min(index, Math.max(flat.length - 1, 0));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[clampedIndex]?.run();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-black/50 px-4 pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="animate-pop w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, clients, projects, deals..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded border border-border bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {flat.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">No results.</p>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted">{g.label}</p>
              {g.items.map((item) => {
                const i = flat.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={item.run}
                    onMouseEnter={() => setIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm",
                      i === clampedIndex
                        ? "bg-white/10 text-foreground"
                        : "text-foreground-secondary"
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className="shrink-0 text-[11px] text-muted">{item.hint}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
