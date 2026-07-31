"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Library,
  ListChecks,
  Palette,
  Settings,
  Target,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/shadcn/command";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useTabs } from "@/lib/tabs";
import { ACCENT_PRESETS, setAccent } from "@/lib/theme";
import { useAuth } from "@/lib/useAuth";
import { canAccess, type PageKey } from "@/lib/permissions";
import type { Client, Deal, Project } from "@/lib/types";

export const OPEN_COMMAND_MENU = "trydent-open-command-menu";

/** Open the ⌘K menu from anywhere (e.g. the topbar search box). */
export function openCommandMenu() {
  window.dispatchEvent(new Event(OPEN_COMMAND_MENU));
}

const PAGES: { href: string; label: string; icon: LucideIcon; page: PageKey }[] = [
  { href: "/my-work", label: "My Work", icon: ListChecks, page: "my-work" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard" },
  { href: "/clients", label: "Clients", icon: Users, page: "clients" },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, page: "pipeline" },
  { href: "/projects", label: "Projects", icon: FolderKanban, page: "projects" },
  { href: "/schedule", label: "Schedule", icon: Calendar, page: "schedule" },
  { href: "/resources", label: "Resources", icon: Library, page: "resources" },
  { href: "/organization", label: "Organisation", icon: Building2, page: "organization" },
  { href: "/accounts", label: "Accounts", icon: Wallet, page: "accounts" },
  { href: "/goals", label: "Goals", icon: Target, page: "goals" },
  { href: "/recruiting", label: "Recruiting", icon: UserPlus, page: "recruiting" },
  { href: "/onboarding", label: "Onboarding", icon: ListChecks, page: "onboarding" },
  { href: "/team", label: "Team", icon: UsersRound, page: "team" },
  { href: "/settings", label: "Settings", icon: Settings, page: "settings" },
];

/** ⌘K palette — real cmdk via shadcn: fuzzy matching + full keyboard model. */
export function CommandMenu() {
  const router = useRouter();
  const { openInNewTab } = useTabs();
  const { access } = useAuth();
  const [open, setOpen] = useState(false);

  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: deals } = useSupabaseTable<Deal>("deals");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_MENU, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_MENU, onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search pages, clients, projects, and deals"
    >
      <CommandInput placeholder="Search pages, clients, projects, deals..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          {PAGES.filter((p) => canAccess(access, p.page)).map((p) => (
            <CommandItem key={p.href} value={`page ${p.label}`} onSelect={() => go(p.href)}>
              <p.icon />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clients.slice(0, 25).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`client ${c.company} ${c.point_person ?? ""}`}
                  onSelect={() => go("/clients")}
                >
                  <Users />
                  <span className="min-w-0 flex-1 truncate">{c.company}</span>
                  <span className="text-xs text-muted-foreground">{c.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {projects.slice(0, 25).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.name}`}
                  onSelect={() => {
                    setOpen(false);
                    openInNewTab(`/projects/${p.id}`, p.name);
                  }}
                >
                  <FolderKanban />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {deals.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Deals">
              {deals.slice(0, 25).map((d) => (
                <CommandItem
                  key={d.id}
                  value={`deal ${d.deal_name}`}
                  onSelect={() => go("/pipeline")}
                >
                  <GitBranch />
                  <span className="min-w-0 flex-1 truncate">{d.deal_name}</span>
                  <span className="text-xs text-muted-foreground">{d.deal_stage}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Theme">
          {ACCENT_PRESETS.map((p) => (
            <CommandItem
              key={p.primary}
              value={`theme ${p.name}`}
              onSelect={() => {
                setAccent(p.primary);
                setOpen(false);
              }}
            >
              <Palette />
              <span className="min-w-0 flex-1 truncate">Theme: {p.name}</span>
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: p.primary }}
              />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
