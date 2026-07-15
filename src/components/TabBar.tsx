"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  FolderKanban,
  GitBranch,
  History,
  LayoutDashboard,
  MonitorSmartphone,
  Plus,
  Settings,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

const TAB_ICONS: [string, React.ComponentType<{ className?: string }>][] = [
  ["/dashboard", LayoutDashboard],
  ["/clients", Users],
  ["/pipeline", GitBranch],
  ["/projects", FolderKanban],
  ["/schedule", Calendar],
  ["/activities", Calendar],
  ["/portals", MonitorSmartphone],
  ["/team", UsersRound],
  ["/settings", Settings],
];

function iconFor(href: string) {
  const match = TAB_ICONS.find(([k]) => href === k || href.startsWith(k + "/"));
  return match ? match[1] : LayoutDashboard;
}

export function TabBar() {
  const router = useRouter();
  const { tabs, activeId, activate, close, newTab } = useTabs();

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      <button
        title="History"
        className="rounded p-1.5 text-muted-2 hover:bg-white/5 hover:text-foreground"
      >
        <History className="h-3.5 w-3.5" />
      </button>
      <button
        title="Back"
        onClick={() => router.back()}
        className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        title="Forward"
        onClick={() => router.forward()}
        className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      <div className="ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = iconFor(tab.href);
          const active = tab.id === activeId;
          return (
            <div
              key={tab.id}
              onClick={() => activate(tab.id)}
              className={cn(
                "animate-pop group flex min-w-0 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "border border-border bg-surface text-foreground"
                  : "border border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground-secondary"
              )}
            >
              <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-foreground-secondary" : "text-muted-foreground")} />
              <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(tab.id);
                  }}
                  className={cn(
                    "rounded p-0.5 text-muted-foreground hover:bg-white/10 hover:text-foreground",
                    active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          title="New tab"
          onClick={newTab}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
