import type { UserRole } from "@/lib/types";

/**
 * Role-based page access.
 *
 * IMPORTANT: this is navigation and UI shaping, not security. Hiding a link
 * stops a rep stumbling into a page; it does not stop anyone typing the URL or
 * querying the table directly. The real boundary is Postgres RLS. Treat this
 * file as "what should this person see", and the migrations as "what can this
 * person reach".
 *
 * Where a page holds genuinely sensitive data (contractor pay), the RLS policy
 * must agree with the preset here.
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

const ALL_STAFF_PAGES: PageKey[] = [
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

export const ROLE_PAGES: Record<UserRole, PageKey[]> = {
  admin: [...ALL_STAFF_PAGES, "portal", "staff-portal"],
  // Reps run client work. Hiring, OKRs and contractor pay stay with admins.
  rep: [
    "my-work",
    "dashboard",
    "clients",
    "pipeline",
    "projects",
    "schedule",
    "organization",
    "team",
    "settings",
    "portal",
  ],
  contractor: ["staff-portal", "settings"],
  client: ["portal"],
};

export function canAccess(role: UserRole | null | undefined, page: PageKey): boolean {
  if (!role) return false;
  return ROLE_PAGES[role]?.includes(page) ?? false;
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

/** What a contractor is paid is admin-only, regardless of page access. */
export function canSeeContractorPay(role: UserRole | null | undefined): boolean {
  return role === "admin";
}
