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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  label?: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string | null;
}) {
  return (
    <div className="flex flex-col gap-px">
      {label && (
        <div className="px-2 pb-1 pt-3 text-xs font-medium text-muted">{label}</div>
      )}
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded px-2 py-[7px] text-[13px] font-medium transition-colors",
              active
                ? "bg-surface-raised text-foreground"
                : "text-muted hover:bg-surface-hover hover:text-foreground-secondary"
            )}
          >
            <item.icon className={cn("h-4 w-4 shrink-0", active && "text-accent")} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex sticky top-0 h-screen w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent text-[11px] font-medium text-accent-foreground">
          TL
        </div>
        <span className="truncate text-[13px] font-medium text-foreground">Trydent Labs</span>
      </div>

      <nav className="flex flex-1 flex-col gap-2 px-2 pb-4">
        <NavGroup items={OVERVIEW} pathname={pathname} />
        <NavGroup label="Workspace" items={WORKSPACE} pathname={pathname} />
        <NavGroup label="Organization" items={ORGANIZATION} pathname={pathname} />
      </nav>
    </aside>
  );
}
