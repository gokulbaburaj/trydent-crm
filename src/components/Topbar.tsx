"use client";

import { Search, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Popover, MenuItem, MenuSeparator } from "@/components/ui/Popover";
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
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
      <div>
        <h1 className="text-[15px] font-semibold text-foreground">{title ?? "Overview"}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            id="global-search-input"
            placeholder="Search..."
            className="w-52 rounded border border-border bg-surface py-1.5 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
        </div>

        {profile && (
          <Popover
            align="right"
            className="w-56"
            trigger={
              <button className="flex items-center rounded p-1 hover:bg-white/5">
                <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
              </button>
            }
          >
            {(close) => (
              <>
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {profile.full_name}
                    </p>
                    <p className="truncate text-xs text-muted">{profile.email}</p>
                  </div>
                </div>
                <div className="px-2 pb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium capitalize text-foreground-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {profile.role}
                  </span>
                </div>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={<LogOut className="h-3.5 w-3.5" />}
                  onClick={() => {
                    close();
                    onSignOut();
                  }}
                >
                  Sign out
                </MenuItem>
              </>
            )}
          </Popover>
        )}
      </div>
    </header>
  );
}
