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
    <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold">{title ?? "Overview"}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search..."
            className="w-56 rounded-full border border-border bg-surface py-2 pl-9 pr-4 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {profile && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5">
            <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
            <div className="hidden sm:block">
              <div className="text-sm font-medium leading-tight">
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
          className="rounded-full p-2 text-muted hover:bg-surface-hover hover:text-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
