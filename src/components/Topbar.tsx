"use client";

import { Search, LogOut, Menu } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Popover, MenuItem, MenuSeparator } from "@/components/ui/Popover";
import { openCommandMenu } from "@/components/CommandMenu";
import type { Profile } from "@/lib/types";

export function Topbar({
  profile,
  onSignOut,
  title,
  onMenuClick,
}: {
  profile: Profile | null;
  onSignOut: () => void;
  title?: string;
  onMenuClick?: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground md:hidden"
          title="Menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="truncate text-[15px] font-semibold text-foreground">
          {title ?? "Overview"}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={openCommandMenu}
          className="hidden w-52 items-center gap-2 rounded border border-border bg-surface py-1.5 pl-2.5 pr-2 text-left text-[13px] text-muted-foreground hover:bg-white/5 hover:text-foreground-secondary sm:flex"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Search...</span>
          <kbd className="rounded border border-border bg-white/5 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </button>
        <button
          onClick={openCommandMenu}
          className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground sm:hidden"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>

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
                    <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
                  </div>
                </div>
                <div className="px-2 pb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium capitalize text-foreground-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
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
