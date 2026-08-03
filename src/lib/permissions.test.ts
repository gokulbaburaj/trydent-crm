import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccess,
  canSeeContractorPay,
  homePathFor,
  isAdmin,
  isPortalOnly,
  pageKeyFor,
  visiblePages,
  type AccessContext,
} from "./permissions.ts";

/**
 * The highest-consequence pure logic in the app. A wrong answer here doesn't
 * look like a bug — it silently shows someone a page, and `isPortalOnly` is
 * derived rather than stored, so there is no row to inspect afterwards.
 */

const admin: AccessContext = { role: "admin" };
const client: AccessContext = { role: "client" };
const freelancer: AccessContext = { role: "contract", grants: ["staff-portal"] };
const staff: AccessContext = { role: "full_time", grants: ["clients", "projects"] };

/* --------------------------------- isAdmin -------------------------------- */

test("isAdmin covers both the account type and the role flag", () => {
  assert.equal(isAdmin(admin), true);
  assert.equal(isAdmin({ role: "full_time", roleIsAdmin: true }), true, "role-granted admin");
  assert.equal(isAdmin(staff), false);
  assert.equal(isAdmin({ role: null }), false);
});

/* ------------------------------ isPortalOnly ------------------------------ */

test("someone holding only the staff portal is portal-only", () => {
  assert.equal(isPortalOnly(freelancer), true);
});

test("PORTAL_COMPATIBLE pages do not promote someone off the portal", () => {
  // The load-bearing case. Granting chat to a freelancer must not drop them
  // into the whole CRM.
  assert.equal(
    isPortalOnly({ role: "contract", grants: ["staff-portal", "channels"] }),
    true,
    "channels is portal-compatible"
  );
  assert.equal(
    isPortalOnly({ role: "contract", grants: ["staff-portal", "settings"] }),
    true,
    "settings is portal-compatible"
  );
});

test("one ordinary page is enough to stop being portal-only", () => {
  assert.equal(
    isPortalOnly({ role: "contract", grants: ["staff-portal", "clients"] }),
    false,
    "a real staff page means they work in the full app"
  );
});

test("admins and clients are never portal-only", () => {
  assert.equal(isPortalOnly({ role: "admin", grants: ["staff-portal"] }), false);
  assert.equal(isPortalOnly({ ...client, grants: ["staff-portal"] }), false);
  assert.equal(
    isPortalOnly({ role: "contract", grants: ["staff-portal"], roleIsAdmin: true }),
    false,
    "a role-granted admin outranks the portal"
  );
});

test("someone with no portal grant is not portal-only", () => {
  assert.equal(isPortalOnly(staff), false);
  assert.equal(isPortalOnly({ role: "contract", grants: [] }), false);
  assert.equal(isPortalOnly({ role: "contract", grants: null }), false);
});

/* -------------------------------- canAccess ------------------------------- */

test("admins reach everything", () => {
  for (const page of ["accounts", "team", "settings", "recruiting"] as const) {
    assert.equal(canAccess(admin, page), true, `admin should reach ${page}`);
  }
});

test("clients reach their portal and nothing else", () => {
  assert.equal(canAccess(client, "portal"), true);
  assert.equal(canAccess(client, "my-work"), false);
  assert.equal(canAccess(client, "clients"), false);
  assert.equal(
    canAccess({ ...client, grants: ["accounts", "team"] }, "accounts"),
    false,
    "a grant list must never lift a client onto a staff page"
  );
});

test("a signed-out context reaches nothing", () => {
  assert.equal(canAccess({ role: null }, "my-work"), false);
  assert.equal(canAccess({ role: undefined }, "settings"), false);
});

test("staff get their floor plus their granted pages", () => {
  assert.equal(canAccess(staff, "my-work"), true, "always-granted floor");
  assert.equal(canAccess(staff, "settings"), true, "always-granted floor");
  assert.equal(canAccess(staff, "clients"), true, "granted");
  assert.equal(canAccess(staff, "accounts"), false, "not granted");
});

test("employment type alone grants nothing beyond the floor", () => {
  // Full-time versus intern is an HR fact, not a permission.
  const intern: AccessContext = { role: "intern", grants: ["pipeline"] };
  const fullTime: AccessContext = { role: "full_time", grants: ["pipeline"] };
  for (const page of ["pipeline", "accounts", "my-work"] as const) {
    assert.equal(
      canAccess(intern, page),
      canAccess(fullTime, page),
      `intern and full-time should agree on ${page}`
    );
  }
});

test("a portal-only person does not get the my-work floor", () => {
  assert.equal(canAccess(freelancer, "staff-portal"), true);
  assert.equal(canAccess(freelancer, "settings"), true, "so they can change their password");
  assert.equal(canAccess(freelancer, "channels"), true, "so the team can reach them");
  assert.equal(canAccess(freelancer, "my-work"), false, "the portal already does that job");
  assert.equal(canAccess(freelancer, "clients"), false);
});

/* ------------------------- visiblePages / homePathFor --------------------- */

test("visiblePages shows a portal-only person just the portal", () => {
  assert.deepEqual(visiblePages(freelancer), ["staff-portal"]);
});

test("visiblePages puts a held portal last for ordinary staff", () => {
  const pages = visiblePages({ role: "full_time", grants: ["clients", "staff-portal"] });
  assert.equal(pages.at(-1), "staff-portal");
  assert.ok(pages.includes("clients"));
});

test("visiblePages is empty when signed out", () => {
  assert.deepEqual(visiblePages({ role: null }), []);
});

test("homePathFor sends everyone to a surface they can actually open", () => {
  assert.equal(homePathFor(admin), "/my-work");
  assert.equal(homePathFor(staff), "/my-work");
  assert.equal(homePathFor(client), "/portal");
  assert.equal(homePathFor(freelancer), "/staff-portal");
  assert.equal(homePathFor({ role: null }), "/login");
});

test("every landing page is one the person can access", () => {
  // Guards the redirect loop: land somewhere you can't open and the layout
  // bounces you straight back.
  for (const ctx of [admin, staff, client, freelancer]) {
    const home = homePathFor(ctx);
    const key = pageKeyFor(home);
    assert.ok(key, `${home} should resolve to a page key`);
    assert.equal(canAccess(ctx, key!), true, `${home} must be openable by its own owner`);
  }
});

/* ------------------------------- pageKeyFor ------------------------------- */

test("pageKeyFor resolves detail routes to their parent", () => {
  assert.equal(pageKeyFor("/clients"), "clients");
  assert.equal(pageKeyFor("/clients/abc-123"), "clients");
  assert.equal(pageKeyFor("/projects/abc-123"), "projects");
});

test("pageKeyFor honours the longest prefix", () => {
  // /staff-portal also starts with /staff... and /portal is a different page.
  assert.equal(pageKeyFor("/staff-portal"), "staff-portal");
  assert.equal(pageKeyFor("/portal"), "portal");
});

test("invoices deliberately ride on the clients grant", () => {
  // The RLS policy on `invoices` is current_can('clients'), so a separate key
  // here would hide a link from someone the database would still serve.
  assert.equal(pageKeyFor("/invoices"), "clients");
});

test("activities is an alias for schedule", () => {
  assert.equal(pageKeyFor("/activities"), "schedule");
  assert.equal(pageKeyFor("/schedule"), "schedule");
});

test("pageKeyFor returns null for an unknown route", () => {
  assert.equal(pageKeyFor("/nonsense"), null);
});

/* --------------------------- canSeeContractorPay -------------------------- */

test("contractor pay is admin-only", () => {
  assert.equal(canSeeContractorPay(admin), true);
  assert.equal(canSeeContractorPay({ role: "full_time", roleIsAdmin: true }), true);
  assert.equal(canSeeContractorPay(staff), false);
  assert.equal(canSeeContractorPay(freelancer), false);
  assert.equal(canSeeContractorPay(client), false);
});
