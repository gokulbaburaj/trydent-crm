"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  FolderKanban,
  GitBranch,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Plus,
  Receipt,
  Settings,
  Target,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { useTabs } from "@/lib/tabs";
import { Tip } from "@/components/ui/Tooltip";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";

const TAB_ICONS: [string, React.ComponentType<{ className?: string }>][] = [
  ["/my-work", ListChecks],
  ["/dashboard", LayoutDashboard],
  ["/clients", Users],
  ["/invoices", Receipt],
  ["/pipeline", GitBranch],
  ["/projects", FolderKanban],
  ["/schedule", Calendar],
  ["/channels", MessageSquare],
  ["/activities", Calendar],
  ["/organization", Building2],
  ["/accounts", Wallet],
  ["/goals", Target],
  ["/recruiting", UserPlus],
  ["/onboarding", ListChecks],
  ["/team", UsersRound],
  ["/settings", Settings],
];

function iconFor(href: string) {
  const match = TAB_ICONS.find(([k]) => href === k || href.startsWith(k + "/"));
  return match ? match[1] : LayoutDashboard;
}

export function TabBar() {
  const router = useRouter();
  const { tabs, activeId, activate, close, newTab, recentlyClosed, reopen, clearRecentlyClosed } =
    useTabs();

  /*
    No ⌘⇧T binding here on purpose. It's the obvious shortcut and it's also
    reserved by every browser for reopening a browser tab — Chrome and Safari
    never deliver the keydown to the page, so the handler would be dead code
    that silently competes with the real shortcut. The button is the affordance.
  */

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      <Popover
        className="w-64"
        trigger={
          <Tip label="Recently closed">
            {/* Dimmed when empty, but still opens — `disabled` here would only
                look disabled, since Popover's trigger wrapper takes the click
                either way. Better it opens and says so. */}
            <button
              className={cn(
                "rounded-md p-1.5 text-muted-2 hover:bg-hover hover:text-foreground",
                recentlyClosed.length === 0 && "opacity-40"
              )}
            >
              <History className="h-3.5 w-3.5" />
            </button>
          </Tip>
        }
      >
        {/* `closeMenu`, not `close` — `close` in this scope is the tab closer. */}
        {(closeMenu) => (
          <>
            <MenuLabel>Recently closed</MenuLabel>
            {recentlyClosed.length === 0 && (
              <p className="px-2 py-1.5 text-[13px] text-muted-2">Nothing closed yet.</p>
            )}
            {recentlyClosed.map((tab) => {
              const Icon = iconFor(tab.href);
              return (
                <MenuItem
                  key={tab.id}
                  icon={<Icon className="h-3.5 w-3.5" />}
                  onClick={() => {
                    reopen(tab.id);
                    closeMenu();
                  }}
                >
                  {tab.title}
                </MenuItem>
              );
            })}
            {recentlyClosed.length > 0 && (
              <>
                <MenuSeparator />
                <MenuItem
                  onClick={() => {
                    clearRecentlyClosed();
                    closeMenu();
                  }}
                >
                  Clear list
                </MenuItem>
              </>
            )}
          </>
        )}
      </Popover>
      <Tip label="Back">
        <button
          onClick={() => router.back()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
      </Tip>
      <Tip label="Forward">
        <button
          onClick={() => router.forward()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </Tip>

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
                  : "border border-transparent text-muted-foreground hover:bg-hover hover:text-foreground-secondary"
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
                    "rounded-md p-0.5 text-muted-foreground hover:bg-active hover:text-foreground",
                    active ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
        <Tip label="New tab">
          <button
            onClick={newTab}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </Tip>
      </div>
    </div>
  );
}
