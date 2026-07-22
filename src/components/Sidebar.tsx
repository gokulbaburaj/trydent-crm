"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  GitBranch,
  FolderKanban,
  Calendar,
  UsersRound,
  Settings,
  ChevronDown,
  ChevronRight,
  Search,
  SquarePen,
  Building2,
  Plus,
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
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/Toaster";
import type { Profile, Team } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOP: NavItem[] = [
  { href: "/my-work", label: "My Work", icon: ListChecks },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const WORKSPACE: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/schedule", label: "Schedule", icon: Calendar },
];

const ORGANIZATION: NavItem[] = [
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
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

  const { profile: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: teamRows, setRows: setTeamRows } = useSupabaseTable<Team>("teams", {
    column: "name",
    ascending: true,
  });

  // Real team records, plus any legacy names still sitting on profiles.
  const teams = useMemo(() => {
    const names = new Set(teamRows.map((t) => t.name));
    for (const p of profiles) if (p.role !== "client" && p.team) names.add(p.team);
    return Array.from(names).sort();
  }, [teamRows, profiles]);

  async function createTeam() {
    const name = window.prompt("New team name:")?.trim();
    if (!name) return;
    if (teams.includes(name)) {
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
          {TOP.map((item) => (
            <NavLink key={item.href} item={item} active={!!isActive(item.href)} onNavigate={onNavigate} />
          ))}
        </div>

        <Section
          id="workspace"
          label="Workspace"
          items={WORKSPACE}
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
              {teams.map((team) => {
                const expanded = !!state.teams[team];
                return (
                  <div key={team} className="flex flex-col gap-px">
                    <button
                      onClick={() => toggleTeam(team)}
                      className="flex items-center gap-1.5 rounded px-2 py-[7px] text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150",
                          expanded && "rotate-90"
                        )}
                      />
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">{team}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-2">
                        {profiles.filter((p) => p.team === team && p.role !== "client").length}
                      </span>
                    </button>
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
          items={ORGANIZATION}
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
  return (
    <Link href={item.href} onClick={onNavigate} className={linkClass(active)}>
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

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-60")}
    >
      <Link href={item.href} onClick={onNavigate} className={linkClass(active)}>
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
