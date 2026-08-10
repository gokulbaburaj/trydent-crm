import type { UserRole } from "@/lib/types";

/**
 * Page access.
 *
 * Two things decide what someone sees, and they do different jobs:
 *
 *   profiles.role  — the ACCOUNT TYPE. admin / rep / contractor / client.
 *                    Sets the floor. A client is never allowed on a staff page
 *                    no matter what else is configured; an admin always is.
 *
 *   roles.pages    — the JOB ROLE's grants, managed by an admin in Settings.
 *                    Video Editor gets projects and schedule; Project Manager
 *                    also gets clients and accounts. This is the dial you turn.
 *
 * The database mirrors this exactly in `current_can(page)` — see
 * 2026-07-27k_role_access.sql. Keep the two in step: if you add a PageKey here,
 * decide whether a policy needs it there.
 *
 * Still true, and still worth stating plainly: hiding a nav link is not
 * security. It stops someone stumbling into a page. What stops them reading the
 * data is RLS, and RLS only covers the sensitive tables (pay, allocations,
 * hiring, goals — see 2026-07-27l). For everything else this file is tidiness,
 * not a boundary.
 */

export type PageKey =
  | "my-work"
  | "dashboard"
  | "clients"
  | "pipeline"
  | "projects"
  | "schedule"
  | "channels"
  | "organization"
  | "accounts"
  | "goals"
  | "recruiting"
  | "onboarding"
  | "team"
  | "settings"
  | "portal"
  | "staff-portal";

/** Every page an admin can reach, in nav order. */
export const ALL_STAFF_PAGES: PageKey[] = [
  "my-work",
  "dashboard",
  "clients",
  "pipeline",
  "projects",
  "schedule",
  "channels",
  "organization",
  "accounts",
  "goals",
  "recruiting",
  "onboarding",
  "team",
  "settings",
];

/**
 * What the Settings picker offers.
 *
 * The staff portal is a page like any other. It used to be a separate
 * per-person toggle, which meant two dials that could contradict — someone
 * marked portal-only had their role's grants silently ignored. Now a
 * "Freelancer" role granted nothing but `staff-portal` produces exactly that
 * behaviour, through the same mechanism as everything else.
 */
export const GRANTABLE_PAGES: PageKey[] = [...ALL_STAFF_PAGES, "staff-portal"];

/**
 * Granting this means the person lives on the cut-down portal. It's listed
 * apart in the picker because it's a different kind of choice — not "one more
 * page" but "instead of the app".
 */
export const PORTAL_PAGE: PageKey = "staff-portal";

/** Human labels for the Settings picker. */
export const PAGE_LABELS: Record<PageKey, string> = {
  "my-work": "My Work",
  dashboard: "Dashboard",
  clients: "Clients",
  pipeline: "Pipeline",
  projects: "Projects",
  schedule: "Schedule",
  channels: "Channels",
  organization: "Organisation",
  accounts: "Payouts",
  goals: "Goals",
  recruiting: "Recruiting",
  onboarding: "Onboarding",
  team: "Team",
  settings: "Settings",
  portal: "Client portal",
  "staff-portal": "Staff portal",
};

/**
 * Pages backed by a real database policy. Granting one of these hands over
 * actual data, not just a menu item — the Settings picker flags them so nobody
 * ticks "Accounts" thinking it only reveals a link.
 */
export const ENFORCED_PAGES: PageKey[] = [
  "accounts",
  "recruiting",
  "onboarding",
  "goals",
  // Every channels policy is `private.current_can('channels')`, so revoking
  // this genuinely cuts someone off from chat rather than only hiding the link.
  "channels",
];

/**
 * Pages nobody should lose. Without My Work and Settings a person signs in to a
 * dead app and can't even change their own password.
 */
export const ALWAYS_GRANTED: PageKey[] = ["my-work", "settings"];

/**
 * What an account type may reach before its job role adds anything.
 *
 * Every employment type gets the same floor. Full-time versus intern is an HR
 * fact, not a permission — what they can reach is their job role's business.
 * Only admin and client differ, because those are account kinds rather than
 * contract terms.
 */
const ACCOUNT_FLOOR: Record<UserRole, PageKey[]> = {
  admin: [...ALL_STAFF_PAGES, "portal", "staff-portal"],
  full_time: [...ALWAYS_GRANTED],
  part_time: [...ALWAYS_GRANTED],
  contract: [...ALWAYS_GRANTED],
  intern: [...ALWAYS_GRANTED],
  client: ["portal"],
};

export interface AccessContext {
  /** profiles.role — the account type. */
  role: UserRole | null | undefined;
  /** roles.pages for the person's job role. */
  grants?: string[] | null;
  /** roles.is_admin — admin rights without the admin account type. */
  roleIsAdmin?: boolean | null;
}

export function isAdmin(ctx: AccessContext): boolean {
  return ctx.role === "admin" || ctx.roleIsAdmin === true;
}

/**
 * True when this person lives on the cut-down staff portal.
 *
 * Derived, not stored: it's what "granted the portal and no real staff pages"
 * means. So there's nothing to keep in sync and nothing that can disagree.
 */
/**
 * Pages that don't imply "this person works in the full app".
 *
 * Everyone gets Settings, and now everyone gets Channels — a freelancer parked
 * on the staff portal still needs to be reachable in chat. Neither is a reason
 * to move someone off the portal, so neither counts when deriving portal-only.
 *
 * This list is load-bearing. Without `channels` on it, granting chat to the
 * Freelancer role would silently stop that role being portal-only and drop
 * those people into the whole CRM.
 */
const PORTAL_COMPATIBLE: PageKey[] = ["settings", "channels"];

export function isPortalOnly(ctx: AccessContext): boolean {
  if (isAdmin(ctx) || ctx.role === "client") return false;
  const grants = ctx.grants ?? [];
  if (!grants.includes(PORTAL_PAGE)) return false;
  return !grants.some(
    (g) => g !== PORTAL_PAGE && !PORTAL_COMPATIBLE.includes(g as PageKey)
  );
}

export function canAccess(ctx: AccessContext, page: PageKey): boolean {
  if (!ctx.role) return false;
  // Admins go everywhere; clients go nowhere but their portal. Neither is
  // negotiable by a role's page list — that's the point of the floor.
  if (isAdmin(ctx)) return true;
  if (ctx.role === "client") return page === "portal";

  const grants = ctx.grants ?? [];
  // Someone parked on the portal doesn't also get My Work — that floor exists
  // so a person isn't stranded, and the portal already does that job. They do
  // keep Settings and Channels: the first so they can change their password,
  // the second so the team can actually reach them.
  if (isPortalOnly(ctx)) {
    return page === PORTAL_PAGE || PORTAL_COMPATIBLE.includes(page);
  }

  if (ACCOUNT_FLOOR[ctx.role]?.includes(page)) return true;
  return grants.includes(page);
}

/** The pages to actually render in the sidebar, in nav order. */
export function visiblePages(ctx: AccessContext): PageKey[] {
  if (!ctx.role) return [];
  if (ctx.role === "client") return ["portal"];
  if (isPortalOnly(ctx)) return [PORTAL_PAGE];
  const pages = ALL_STAFF_PAGES.filter((p) => canAccess(ctx, p));
  // Someone can hold the portal alongside real pages — show it last.
  if ((ctx.grants ?? []).includes(PORTAL_PAGE)) pages.push(PORTAL_PAGE);
  return pages;
}

/** Where to send someone who's just signed in. */
export function homePathFor(ctx: AccessContext): string {
  if (!ctx.role) return "/login";
  if (ctx.role === "client") return "/portal";
  if (isPortalOnly(ctx)) return "/staff-portal";
  return "/my-work";
}

/** Route → page key. Longest-prefix wins so /clients/<id> resolves to clients. */
const ROUTE_KEYS: [string, PageKey][] = [
  ["/my-work", "my-work"],
  ["/dashboard", "dashboard"],
  ["/clients", "clients"],
  // Invoices ride on the Clients grant on purpose: the RLS policy on the
  // `invoices` table is `current_can('clients')`, so a separate key here would
  // hide the link from someone the database would still serve. Splitting them
  // starts with a migration, not with this list.
  ["/invoices", "clients"],
  ["/pipeline", "pipeline"],
  ["/projects", "projects"],
  ["/schedule", "schedule"],
  ["/activities", "schedule"],
  ["/channels", "channels"],
  ["/organization", "organization"],
  ["/payouts", "accounts"],
  ["/goals", "goals"],
  ["/recruiting", "recruiting"],
  ["/onboarding", "onboarding"],
  ["/team", "team"],
  ["/settings", "settings"],
  ["/portal", "portal"],
  ["/staff-portal", "staff-portal"],
];

export function pageKeyFor(pathname: string): PageKey | null {
  const match = ROUTE_KEYS.filter(([prefix]) => pathname.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length
  )[0];
  return match ? match[1] : null;
}

/**
 * What a contractor is paid.
 *
 * Admin only, and this one is genuinely enforced — 2026-07-27l restricts
 * `staff_payments` to admins plus the person the row is about. Hiding the
 * column here just stops the UI showing a blank.
 */
export function canSeeContractorPay(ctx: AccessContext): boolean {
  return isAdmin(ctx);
}
