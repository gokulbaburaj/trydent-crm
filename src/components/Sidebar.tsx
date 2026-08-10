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
  ListChecks,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Receipt,
  Search,
  Settings,
  Target,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
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
import { reportError } from "@/lib/reportError";
import { canAccess, type PageKey } from "@/lib/permissions";
import type { Profile, Team } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  page: PageKey;
}

/*
  ── Grouped by purpose, 9 Aug ───────────────────────────────────────────────

  Was: two pinned items, then a "Workspace" section holding Clients, Pipeline,
  Invoices, Projects, Schedule and Channels. Six things with nothing in common
  beyond "not admin", under a label that told you nothing — you had to read all
  six every time because the heading never narrowed the search.

  The reference's rail works because each label answers "what am I trying to
  do": My Work, Customers, Sales, Performance, Collateral. You skip four
  sections without reading them. That's the whole value of a section label and
  it's why an accurate one beats a tidy one.

  Splitting on that axis puts Schedule with My Work (it's your day, not a
  customer record), Channels with Customers (that's who you're talking to), and
  leaves Sales holding the three things that actually track money: Pipeline →
  Invoices → Projects, in the order the money moves.
*/
const MY_WORK: NavItem[] = [
  { href: "/my-work", label: "My Work", icon: ListChecks, page: "my-work" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard" },
  { href: "/schedule", label: "Schedule", icon: Calendar, page: "schedule" },
];

const CUSTOMERS: NavItem[] = [
  { href: "/clients", label: "Clients", icon: Users, page: "clients" },
  { href: "/channels", label: "Channels", icon: MessageSquare, page: "channels" },
];

const SALES: NavItem[] = [
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, page: "pipeline" },
  { href: "/projects", label: "Projects", icon: FolderKanban, page: "projects" },
];

/*
  ── Finance, 11 Aug ─────────────────────────────────────────────────────────

  Invoices moved out of Sales and Payouts out of Performance, into one section
  holding both directions of money: what comes in, and what goes out.

  This reverses the note above about Sales being "the order the money moves:
  Pipeline → Invoices → Projects". That ordering was true and still put
  Invoices next to Projects, which is delivery, while the page it actually
  belongs beside — Payouts — sat two sections away under a heading about
  performance. Invoices and Payouts are the same job seen from two ends, and
  answering "where's the money" meant looking in two places.

  Performance is gone as a section: it held Goals and Payouts, which had
  nothing to do with each other beyond both being numbers. Goals is a company
  objective and now sits with Organisation.
*/
const FINANCE: NavItem[] = [
  // Money in first — an invoice is what makes a payout affordable.
  // Shares the Clients grant; see ROUTE_KEYS in permissions.
  { href: "/invoices", label: "Invoices", icon: Receipt, page: "clients" },
  { href: "/payouts", label: "Payouts", icon: Wallet, page: "accounts" },
];

const ORGANIZATION: NavItem[] = [
  { href: "/organization", label: "Organisation", icon: Building2, page: "organization" },
  /*
    Goals came here on 11 Aug, from a Performance section that no longer
    exists. The 9 Aug note below argues it shouldn't be buried in the hub, and
    that still holds — this is a direct link under a heading, not a hub entry.
    Company objectives are an organisation-level thing; grouping them with
    Payouts only ever meant "these are both charts".
  */
  { href: "/goals", label: "Goals", icon: Target, page: "goals" },
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
 *
 * Goals left this list on 9 Aug and now sits under Performance unconditionally.
 * It's a destination people go to on purpose and check often, which is not what
 * the hub is for — the hub exists to keep four ADMIN pages from crowding the
 * rail. Consequence: someone holding `organization` now sees a Goals link they
 * previously reached only through the hub. That's the intended trade.
 */
const ORG_DETAIL: NavItem[] = [
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
  const { state, toggleSection, toggleTeam, openTeam, setOrder, toggleRail } = useNavState();
  // The mobile drawer is already a deliberate act of opening the nav — folding
  // it to icons in there would be hiding the thing you just asked for.
  const rail = state.rail && !mobile;

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
      reportError("create team", error);
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
        "h-full shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-background",
        // Width is transitioned rather than swapped so folding reads as the
        // rail moving out of the way, not as the page reflowing under you.
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        rail ? "w-[60px]" : "w-[220px]",
        mobile ? "flex w-full" : "hidden md:flex"
      )}
    >
      {/*
        "Menu" as a literal heading, with the fold control beside it.

        Lifted straight from the reference and it's a better call than the
        workspace switcher that was here: the switcher looked like a control
        and did nothing (there is one workspace), while the rail had no
        heading at all — so the first labelled thing on screen was a section.
        Naming the rail is what makes the section labels below it read as
        subdivisions of something rather than as four floating captions.
      */}
      <div className={cn("flex items-center gap-2 px-3 py-3.5", rail && "justify-center px-0")}>
        {!rail && (
          <h2 className="min-w-0 flex-1 truncate text-[19px] font-semibold tracking-tight">
            Menu
          </h2>
        )}
        {!rail && (
          <button
            title="Search (⌘K)"
            onClick={openCommandMenu}
            className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        {!mobile && (
          <button
            onClick={toggleRail}
            title={rail ? "Expand menu" : "Collapse menu"}
            aria-label={rail ? "Expand menu" : "Collapse menu"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <PanelLeftClose
              className={cn("h-4 w-4 transition-transform duration-200", rail && "rotate-180")}
            />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">
        <Section
          id="my-work"
          label="My Work"
          items={allowed(MY_WORK)}
          state={state}
          rail={rail}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />

        <Section
          id="customers"
          label="Customers"
          items={allowed(CUSTOMERS)}
          state={state}
          rail={rail}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />

        <Section
          id="sales"
          label="Sales"
          items={allowed(SALES)}
          state={state}
          rail={rail}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />

        <Section
          id="finance"
          label="Finance"
          items={allowed(FINANCE)}
          state={state}
          rail={rail}
          onToggle={toggleSection}
          onReorder={setOrder}
          isActive={isActive}
          onNavigate={onNavigate}
        />

        {/* Teams — each expands to its own scoped views.
            Dropped entirely in rail mode: a team is identified by its NAME, and
            every row would collapse to the same Building2 glyph. Five identical
            icons is worse than no section. */}
        <div className={cn("flex flex-col gap-px", rail && "hidden")}>
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
                className="mt-2.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-hover hover:text-foreground group-hover/hdr:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
              state.collapsed.teams ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
            )}
          >
            <div className="overflow-hidden">
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
                        "group/team flex items-center rounded-md pr-2 transition-colors hover:bg-hover",
                        pathname === `/team/${teamId}` && "bg-hover"
                      )}
                    >
                      <button
                        onClick={() => toggleTeam(team)}
                        aria-label={expanded ? `Collapse ${team}` : `Expand ${team}`}
                        className="shrink-0 rounded-md py-[7px] pl-2 pr-1 text-muted-foreground hover:text-foreground"
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
                          onClick={() => {
                            // Opening a team's dashboard expands it and closes
                            // the rest, so the sidebar shows where you are.
                            openTeam(team);
                            onNavigate?.();
                          }}
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
                    {/*
                      Animated with grid-template-rows, 0fr to 1fr.

                      Height can't be transitioned from `auto`, and the usual
                      workarounds mean measuring the content and writing a pixel
                      value — which breaks the moment a team gains a sub-link.
                      A single-row grid interpolates the track size for us, so
                      the content stays unmeasured and the row is always the
                      right height. The inner div carries overflow-hidden;
                      without it the links spill out during the collapse.
                    */}
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      )}
                    >
                      <div className="overflow-hidden">
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
                        {/* Every team has exactly one channel, created with the
                            team. So this opens the conversation directly rather
                            than a list of one. */}
                        {canAccess(access, "channels") && (
                          <SubLink
                            href={`/channels?team=${encodeURIComponent(team)}`}
                            label="Channel"
                            icon={MessageSquare}
                            active={pathname === "/channels" && activeTeam === team}
                            onNavigate={onNavigate}
                          />
                        )}
                      </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>

        <Section
          id="organization"
          label="Organization"
          items={orgItems}
          state={state}
          rail={rail}
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
      className="group flex items-center gap-1 rounded-md px-2 pb-1.5 pt-4 text-[13px] font-medium text-muted-foreground hover:text-foreground-secondary"
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

/**
 * The divider that stands in for a section label when the rail is folded.
 *
 * Not a tooltip and not a truncated label — at 60px there is no honest way to
 * show "Performance", and a first-letter chip ("P") is a puzzle. A rule is an
 * admission that the grouping still exists while the name doesn't, which is
 * accurate. The name comes back when you unfold.
 */
function RailDivider() {
  return <div className="mx-auto my-2 h-px w-6 bg-border-subtle" />;
}

function Section({
  id,
  label,
  items,
  state,
  rail = false,
  onToggle,
  onReorder,
  isActive,
  onNavigate,
}: {
  id: string;
  label: string;
  items: NavItem[];
  state: ReturnType<typeof useNavState>["state"];
  rail?: boolean;
  onToggle: (id: string) => void;
  onReorder: (id: string, hrefs: string[]) => void;
  isActive: (href: string) => boolean | undefined;
  onNavigate?: () => void;
}) {
  const ordered = useMemo(() => applyOrder(items, state.order[id]), [items, state.order, id]);
  // A folded rail shows every item. Honouring a per-section collapse here would
  // hide links behind two independent controls, one of which isn't on screen —
  // you'd fold the rail and lose Pipeline with nothing to click to get it back.
  const collapsed = !rail && !!state.collapsed[id];

  // Distance constraint so a plain click still navigates.
  /*
  KeyboardSensor alongside PointerSensor.

  Every drag surface in this app shipped pointer-only, which means reordering
  was impossible without a mouse — six surfaces, none of them keyboard
  reachable. dnd-kit is accessible by design, but only if you register this
  sensor; the accessibility isn't automatic, it's opt-in and we hadn't opted.

  `sortableKeyboardCoordinates` is what makes arrow keys move an item BY LIST
  POSITION rather than by pixels. Without it the default coordinate getter
  moves 25px per press, which on a sortable list means several presses to
  advance one row and no way to know when you've crossed a boundary.

  Interaction: Tab to the item, Space to lift, arrows to move, Space to drop,
  Escape to cancel. dnd-kit announces each step to screen readers using its
  built-in announcements.
*/
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const hrefs = ordered.map((i) => i.href);
    const from = hrefs.indexOf(String(active.id));
    const to = hrefs.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(id, arrayMove(hrefs, from, to));
  }

  // Nothing survived the permission filter — a label over empty space reads as
  // a loading state. Below the hooks, not above: an early return before
  // useSensors changes hook order between renders as permissions resolve.
  if (ordered.length === 0) return null;

  return (
    <div className="flex flex-col gap-px">
      {rail ? (
        <RailDivider />
      ) : (
        <SectionHeader label={label} collapsed={collapsed} onToggle={() => onToggle(id)} />
      )}
      {/* Same 0fr/1fr grid as the team rows, so every collapse in the sidebar
          moves the same way. Kept mounted rather than conditionally rendered —
          unmounting would snap the section shut with nothing to animate. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
      >
        <div className="overflow-hidden">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ordered.map((i) => i.href)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-px">
                {ordered.map((item) => (
                  <SortableNavLink
                    key={item.href}
                    item={item}
                    active={!!isActive(item.href)}
                    rail={rail}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

/*
  Pill, not a rounded rectangle.

  The active row in the reference is a full-height rounded-full capsule, and
  that shape is doing real work: it matches the black action pills and the
  stage stepper, so "the selected thing" looks the same everywhere in the app.
  A 6px-radius highlight next to a 20px-radius card is the detail that made the
  first pass read as a themed admin panel.
*/
const linkClass = (active: boolean, rail = false) =>
  cn(
    "flex items-center rounded-full text-[13px] font-medium transition-colors",
    rail ? "h-9 w-9 justify-center" : "gap-2.5 px-3 py-2",
    active
      ? "bg-active text-foreground"
      : "text-foreground-secondary hover:bg-hover hover:text-foreground"
  );

function SortableNavLink({
  item,
  active,
  rail = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  rail?: boolean;
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
      className={cn("touch-none", rail && "flex justify-center", isDragging && "opacity-60")}
    >
      <Link
        href={item.href}
        // `title`, not a Tooltip component: this is the only label a folded
        // rail has, and it must survive a pointer-down that starts a drag —
        // Radix tooltips dismiss on pointer-down.
        title={rail ? item.label : undefined}
        onClick={(e) => {
          if (go(item.href)) e.preventDefault();
          onNavigate?.();
        }}
        className={linkClass(active, rail)}
      >
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        />
        {!rail && item.label}
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
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-active text-foreground"
          : "text-muted-foreground hover:bg-hover hover:text-foreground-secondary"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}
