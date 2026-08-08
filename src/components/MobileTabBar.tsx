"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ListChecks, Menu, MessageSquare, Users } from "lucide-react";
import { canAccess, type AccessContext, type PageKey } from "@/lib/permissions";
import { useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

/**
 * Bottom navigation, phones only.
 *
 * Before this, every navigation on a phone meant opening the hamburger drawer —
 * the sidebar is `hidden md:flex` and nothing stood in its place. Measured on
 * device 7 Aug: all four surfaces that matter were two taps away.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 * A floating pill rather than an edge-attached bar, which is what the BizLink
 * and Fishbowl references use — and they render it DARK on a light app, which
 * is now exactly our situation too. `--foreground` as the pill surface with
 * `--background` icons, so it reads as a solid object floating over the page
 * rather than a panel cut out of it.
 *
 * Inactive items are icon-only; the active one expands to show its label. Pure
 * icon nav fails here specifically — Clients and Channels are both
 * people-shaped and people guess wrong. Expanding only the active item keeps
 * the pill narrow enough for five targets at 390px while never leaving you
 * without a word for where you are.
 *
 * Five is the ceiling. Past that the targets drop under 44px.
 */
const TABS: { href: string; label: string; icon: typeof ListChecks; page: PageKey }[] = [
  { href: "/my-work", label: "My Work", icon: ListChecks, page: "my-work" },
  { href: "/schedule", label: "Schedule", icon: Calendar, page: "schedule" },
  { href: "/clients", label: "Clients", icon: Users, page: "clients" },
  { href: "/channels", label: "Channels", icon: MessageSquare, page: "channels" },
];

export function MobileTabBar({
  access,
  onOpenMenu,
}: {
  access: AccessContext;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const { go } = useTabs();

  // Same filter the sidebar uses. A tab the database would refuse is worse than
  // a missing one — see the UI/RLS note in CLAUDE.md.
  const visible = TABS.filter((t) => canAccess(access, t.page));

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center md:hidden",
        // Clear of the home indicator, plus a little air so it reads as floating
        // rather than jammed against the bezel.
        "px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      )}
    >
      <nav
        aria-label="Primary"
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-1 rounded-full p-1.5",
          "bg-foreground/95 backdrop-blur-xl",
          "shadow-xl shadow-black/20"
        )}
      >
        {visible.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={(e) => {
                // Reuse an already-open tab rather than rewriting the current
                // one, exactly as the sidebar does.
                if (go(tab.href)) e.preventDefault();
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                // min-h/min-w 11 = 44px, the floor for a touch target.
                "flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "min-w-11 text-background/60 active:bg-background/10 active:text-background"
              )}
            >
              <tab.icon className="h-[18px] w-[18px] shrink-0" />
              {/* Label on the active item only — see the note above. */}
              {active && (
                <span className="whitespace-nowrap text-[13px] font-medium">{tab.label}</span>
              )}
            </Link>
          );
        })}

        <button
          onClick={onOpenMenu}
          aria-label="More"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-background/60 transition-colors active:bg-background/10 active:text-background"
        >
          <Menu className="h-[18px] w-[18px] shrink-0" />
        </button>
      </nav>
    </div>
  );
}
