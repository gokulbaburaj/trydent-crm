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
  | "organization"
  | "accounts"
  | "goals"
  | "recruiting"
  | "onboarding"
  | "team"
  | "settings"
  | "portal"
  | "staff-portal";

/** Every page an admin can reach, in nav order. Drives the Settings picker. */
export const ALL_STAFF_PAGES: PageKey[] = [
  "my-work",
  "dashboard",
  "clients",
  "pipeline",
  "projects",
  "schedule",
  "organization",
  "accounts",
  "goals",
  "recruiting",
  "onboarding",
  "team",
  "settings",
];

/** Human labels for the Settings picker. */
export const PAGE_LABELS: Record<PageKey, string> = {
  "my-work": "My Work",
  dashboard: "Dashboard",
  clients: "Clients",
  pipeline: "Pipeline",
  projects: "Projects",
  schedule: "Schedule",
  organization: "Organisation",
  accounts: "Accounts",
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
export const ENFORCED_PAGES: PageKey[] = ["accounts", "recruiting", "onboarding", "goals"];

/**
 * Pages nobody should lose. Without My Work and Settings a person signs in to a
 * dead app and can't even change their own password.
 */
export const ALWAYS_GRANTED: PageKey[] = ["my-work", "settings"];

/** What an account type may reach before its job role adds anything. */
const ACCOUNT_FLOOR: Record<UserRole, PageKey[]> = {
  admin: [...ALL_STAFF_PAGES, "portal", "staff-portal"],
  rep: [...ALWAYS_GRANTED],
  contractor: ["staff-portal", ...ALWAYS_GRANTED],
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

export function canAccess(ctx: AccessContext, page: PageKey): boolean {
  if (!ctx.role) return false;
  // Admins go everywhere; clients go nowhere but their portal. Neither is
  // negotiable by a role's page list — that's the point of the floor.
  if (isAdmin(ctx)) return true;
  if (ctx.role === "client") return page === "portal";

  if (ACCOUNT_FLOOR[ctx.role]?.includes(page)) return true;
  return (ctx.grants ?? []).includes(page);
}

/**
 * The pages to actually render in the sidebar, in nav order.
 * Contractors keep their portal; everyone else gets the staff pages they hold.
 */
export function visiblePages(ctx: AccessContext): PageKey[] {
  if (!ctx.role) return [];
  if (ctx.role === "client") return ["portal"];
  const candidates: PageKey[] =
    ctx.role === "contractor" ? ["staff-portal", ...ALL_STAFF_PAGES] : ALL_STAFF_PAGES;
  return candidates.filter((p) => canAccess(ctx, p));
}

/** Route → page key. Longest-prefix wins so /clients/<id> resolves to clients. */
const ROUTE_KEYS: [string, PageKey][] = [
  ["/my-work", "my-work"],
  ["/dashboard", "dashboard"],
  ["/clients", "clients"],
  ["/pipeline", "pipeline"],
  ["/projects", "projects"],
  ["/schedule", "schedule"],
  ["/activities", "schedule"],
  ["/organization", "organization"],
  ["/accounts", "accounts"],
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
