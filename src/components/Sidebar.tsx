"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  GitBranch,
  LayoutDashboard,
  Library,
  ListChecks,
  Plus,
  Search,
  Settings,
  SquarePen,
  Target,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { openCommandMenu } from "@/components/CommandMenu";
import { applyOrder, useNavState } from "@/lib/nav";
import { useTabs } from "@/lib/tabs";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/Toaster";
import { canAccess, type PageKey } from "@/lib/permissions";
import type { Profile, Team } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  page: PageKey;
}

const TOP: NavItem[] = [
  { href: "/my-work", label: "My Work", icon: ListChecks, page: "my-work" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard" },
];

const WORKSPACE: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Users, page: "clients" },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, page: "pipeline" },
  { href: "/projects", label: "Projects", icon: FolderKanban, page: "projects" },
  { href: "/schedule", label: "Schedule", icon: Calendar, page: "schedule" },
  { href: "/resources", label: "Resources", icon: Library, page: "resources" },
];

const ORGANIZATION: NavItem[] = [
  { href: "/organization", label: "Organisation", icon: Building2, page: "organization" },
  { href: "/accounts", label: "Accounts", icon: Wallet, page: "accounts" },
  { href: "/settings", label: "Settings", icon: Settings, page: "settings" },
];

/**
 * Pages that live behind the /organization hub.
 *
 * They were taken out of the sidebar when the hub was built — one entry
 * instead of five, which kept an admin's nav readable. That reasoning only
 * held while everyone with access was an admin.
 *
 * It breaks the moment access is granted per role: give an HR role nothing but
 * `recruiting` and they sign in to a sidebar with no Recruiting link and no way
 * to reach the one page they exist to use.
 *
 * So: anyone holding the hub still gets the tidy single entry. Anyone granted
 * these pages *without* the hub gets direct links, because otherwise the grant
 * is unusable.
 */
const ORG_DETAIL: NavItem[] = [
  { href: "/goals", label: "Goals", icon: Target, page: "goals" },
  { href: "/recruiting", label: "Recruiting", icon: UserPlus, page: "recruiting" },
  { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck, page: "onboarding" },
  { href: "/team", label: "Team", icon: UsersRound, page: "team" },
];

export function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTeam = searchParams.get("team");
  const { state, toggleSection, toggleTeam, setOrder } = useNavState();

  const { profile: me, access } = useAuth();
  const isAdmin = me?.role === "admin";
  /** UI shaping only — RLS is what actually protects the data. */
  const allowed = (items: NavItem[]) => items.filter((i) => canAccess(access, i.page));

  // The hub covers Goals, Recruiting, Onboarding and Team for anyone who holds
  // it. Anyone who doesn't needs the direct links, or a role granted just
  // `recruiting` has nowhere to click.
  const orgItems = [
    ...allowed(ORGANIZATION),
    ...(canAccess(access, "organization") ? [] : allowed(ORG_DETAIL)),
  ];
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: teamRows, setRows: setTeamRows } = useSupabaseTable<Team>("teams", {
    column: "name",
    ascending: true,
  });

  /**
   * Real team records, plus any legacy names still sitting on profiles.
   *
   * The id is what the dashboard route needs. Legacy names have none — they're
   * a team someone typed onto a profile before `teams` existed — so those rows
   * stay expandable but don't link anywhere. Creating the team properly in
   * Settings is what gives them a page.
   */
  const teams = useMemo(() => {
    const byName = new Map<string, string | null>();
    for (const t of teamRows) byName.set(t.name, t.id);
    for (const p of profiles) {
      if (p.role !== "client" && p.team && !byName.has(p.team)) byName.set(p.team, null);
    }
    return Array.from(byName.entries())
      .map(([name, id]) => ({ name, id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teamRows, profiles]);

  async function createTeam() {
    const name = window.prompt("New team name:")?.trim();
    if (!name) return;
    if (teams.some((t) => t.name === name)) {
      toast.error(`"${name}" already exists.`);
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase.from("teams").insert({ name }).select().single();
    if (error) {
      toast.error(`Couldn't create team: ${error.message}`);
      return;
    }
    setTeamRows((prev) => [...prev, data as Team]);
    toast.success(`Team "${name}" created`);
  }

  const isActive = (href: string) =>
    !activeTeam && (pathname === href || pathname?.startsWith(href + "/"));

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
        {/* Pinned top items — not collapsible, not reorderable */}
        <div className="flex flex-col gap-px">
          {allowed(TOP).map((item) => (
            <NavLink key={item.href} item={item} active={!!isActive(item.href)} onNavigate={onNavigate} />
          ))}
        </div>

        <Section
          id="workspace"
          label="Workspace"
          items={allowed(WORKSPACE)}
          state={state}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />

        {/* Teams — each expands to its own scoped views */}
        <div className="flex flex-col gap-px">
          <div className="group/hdr flex items-center">
            <div className="min-w-0 flex-1">
              <SectionHeader
                label="Your teams"
                collapsed={!!state.collapsed.teams}
                onToggle={() => toggleSection("teams")}
              />
            </div>
            {isAdmin && (
              <button
                onClick={createTeam}
                title="New team"
                className="mt-2.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-foreground group-hover/hdr:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!state.collapsed.teams && (
            <div className="flex flex-col gap-px">
              {teams.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-2">
                  No teams yet{isAdmin ? " — use + to create one." : "."}
                </p>
              )}
              {teams.map(({ name: team, id: teamId }) => {
                const expanded = !!state.teams[team];
                return (
                  <div key={team} className="flex flex-col gap-px">
                    {/*
                      Chevron toggles, name navigates. One control doing both
                      is the usual sidebar mistake: expanding to see what's
                      inside and opening the thing itself are different
                      intentions, and a row that only expands makes the team
                      name look like a header rather than a destination.
                    */}
                    <div
                      className={cn(
                        "group/team flex items-center rounded pr-2 transition-colors hover:bg-white/5",
                        pathname === `/team/${teamId}` && "bg-white/[0.07]"
                      )}
                    >
                      <button
                        onClick={() => toggleTeam(team)}
                        aria-label={expanded ? `Collapse ${team}` : `Expand ${team}`}
                        className="shrink-0 rounded py-[7px] pl-2 pr-1 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 transition-transform duration-150",
                            expanded && "rotate-90"
                          )}
                        />
                      </button>
                      {teamId ? (
                        <Link
                          href={`/team/${teamId}`}
                          onClick={onNavigate}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-1.5 py-[7px] text-[13px] font-medium transition-colors",
                            pathname === `/team/${teamId}`
                              ? "text-foreground"
                              : "text-foreground-secondary group-hover/team:text-foreground"
                          )}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-left">{team}</span>
                        </Link>
                      ) : (
                        <button
                          onClick={() => toggleTeam(team)}
                          title="Create this team in Settings to give it a page"
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-[7px] text-[13px] font-medium text-foreground-secondary transition-colors group-hover/team:text-foreground"
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-left">{team}</span>
                        </button>
                      )}
                      <span className="shrink-0 pl-1.5 text-[10px] tabular-nums text-muted-2">
                        {profiles.filter((p) => p.team === team && p.role !== "client").length}
                      </span>
                    </div>
                    {expanded && (
                      <div className="ml-[15px] flex flex-col gap-px border-l border-border-subtle pl-2">
                        <SubLink
                          href={`/team?team=${encodeURIComponent(team)}`}
                          label="Members"
                          icon={UsersRound}
                          active={pathname === "/team" && activeTeam === team}
                          onNavigate={onNavigate}
                        />
                        <SubLink
                          href={`/projects?team=${encodeURIComponent(team)}`}
                          label="Projects"
                          icon={FolderKanban}
                          active={pathname === "/projects" && activeTeam === team}
                          onNavigate={onNavigate}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Section
          id="organization"
          label="Organization"
          items={orgItems}
          state={state}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />
      </nav>
    </aside>
  );
}

/* ---------------------------------- Pieces ---------------------------------- */

function SectionHeader({
  label,
  collapsed,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="group flex items-center gap-1 rounded px-2 pb-1.5 pt-4 text-xs font-medium text-muted-foreground hover:text-foreground-secondary"
    >
      {label}
      <ChevronDown
        className={cn(
          "h-3 w-3 transition-transform duration-150",
          collapsed && "-rotate-90"
        )}
      />
    </button>
  );
}

function Section({
  id,
  label,
  items,
  state,
  onToggle,
  onReorder,
  isActive,
  onNavigate,
}: {
  id: string;
  label: string;
  items: NavItem[];
  state: ReturnType<typeof useNavState>["state"];
  onToggle: (id: string) => void;
  onReorder: (id: string, hrefs: string[]) => void;
  isActive: (href: string) => boolean | undefined;
  onNavigate?: () => void;
}) {
  const ordered = useMemo(() => applyOrder(items, state.order[id]), [items, state.order, id]);
  const collapsed = !!state.collapsed[id];

  // Distance constraint so a plain click still navigates.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const hrefs = ordered.map((i) => i.href);
    const from = hrefs.indexOf(String(active.id));
    const to = hrefs.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(id, arrayMove(hrefs, from, to));
  }

  return (
    <div className="flex flex-col gap-px">
      <SectionHeader label={label} collapsed={collapsed} onToggle={() => onToggle(id)} />
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((i) => i.href)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-px">
              {ordered.map((item) => (
                <SortableNavLink
                  key={item.href}
                  item={item}
                  active={!!isActive(item.href)}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

const linkClass = (active: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded px-2 py-[7px] text-[13px] font-medium transition-colors",
    active
      ? "bg-white/10 text-foreground"
      : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
  );

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const { go } = useTabs();
  return (
    <Link
      href={item.href}
      onClick={(e) => {
        // If this page is already open in another tab, jump to it instead of
        // turning the current tab into a duplicate.
        if (go(item.href)) e.preventDefault();
        onNavigate?.();
      }}
      className={linkClass(active)}
    >
      <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {item.label}
    </Link>
  );
}

function SortableNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.href,
  });
  const { go } = useTabs();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-60")}
    >
      <Link
        href={item.href}
        onClick={(e) => {
          if (go(item.href)) e.preventDefault();
          onNavigate?.();
        }}
        className={linkClass(active)}
      >
        <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {item.label}
      </Link>
    </div>
  );
}

function SubLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-white/10 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}
