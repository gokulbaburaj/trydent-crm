"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GitBranch,
  FolderKanban,
  Calendar,
  MonitorSmartphone,
  UsersRound,
  Settings,
  ChevronDown,
  Search,
  SquarePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openCommandMenu } from "@/components/CommandMenu";

const OVERVIEW = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

const WORKSPACE = [
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/portals", label: "Client Portals", icon: MonitorSmartphone },
];

const ORGANIZATION = [
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label?: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-px">
      {label && (
        <div className="flex items-center gap-1 px-2 pb-1.5 pt-4 text-xs font-medium text-muted-foreground">
          {label}
          <ChevronDown className="h-3 w-3" />
        </div>
      )}
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded px-2 py-[7px] text-[13px] font-medium transition-colors",
              active
                ? "bg-white/10 text-foreground"
                : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "h-full w-[220px] shrink-0 flex-col overflow-y-auto bg-background",
        mobile ? "flex w-full" : "hidden md:flex"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3.5">
        <button className="flex min-w-0 items-center gap-1.5 rounded px-1 py-1 text-[13px] font-medium text-foreground hover:bg-white/5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-medium text-primary-foreground">
            TL
          </div>
          <span className="truncate">Trydent Labs</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            title="Search (⌘K)"
            onClick={openCommandMenu}
            className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            title="New"
            className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <SquarePen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">
        <NavGroup items={OVERVIEW} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="Workspace" items={WORKSPACE} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="Organization" items={ORGANIZATION} pathname={pathname} onNavigate={onNavigate} />
      </nav>
    </aside>
  );
}
