"use client";

import { Search, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import type { Profile } from "@/lib/types";

export function Topbar({
  profile,
  onSignOut,
  title,
}: {
  profile: Profile | null;
  onSignOut: () => void;
  title?: string;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3.5">
      <div>
        <h1 className="text-[15px] font-semibold text-foreground">{title ?? "Overview"}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search..."
            className="w-52 rounded border border-border bg-surface-raised py-1.5 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
        </div>

        {profile && (
          <div className="flex items-center gap-2 rounded border border-border bg-surface-raised px-2 py-1">
            <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
            <div className="hidden sm:block">
              <div className="text-[13px] font-medium leading-tight text-foreground">
                {profile.full_name}
              </div>
              <Badge tone="green" className="mt-0.5">
                {profile.role}
              </Badge>
            </div>
          </div>
        )}

        <button
          onClick={onSignOut}
          className="rounded p-2 text-muted hover:bg-surface-hover hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
