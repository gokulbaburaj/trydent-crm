import { NextResponse } from "next/server";

/**
 * The API-route half of `reportError`.
 *
 * ── Why this exists separately ──────────────────────────────────────────────
 *
 * `reportError` fixed 52 client call sites that piped `error.message` into a
 * toast. It couldn't fix the routes: it imports the Toaster, so it's
 * client-only, and a route's job is to return a body rather than show
 * something. So five `NextResponse.json({ error: err.message })` sites
 * survived that pass — and they're worse than the client ones were, because
 * `team/page.tsx:150` renders `json.error` directly in a toast. The database's
 * message reached the screen either way; it just took a different road.
 *
 * These are admin-only routes, which narrows the audience but doesn't change
 * the shape: a Postgres error names tables, columns and constraints, and
 * Supabase Auth's errors describe its internal state. Neither is ours to hand
 * out.
 *
 * ── What stays specific ─────────────────────────────────────────────────────
 *
 * Deliberately-written messages are not touched and should not be routed
 * through here. "That email is already in use." tells an admin something true
 * and actionable that they can't get any other way, and the migration hint in
 * team-users points at the exact file to run. The rule is the same one
 * reportError states: if a failure deserves a specific message, write that
 * message — don't forward the one you were handed.
 */
export function serverError(
  action: string,
  error: unknown,
  status = 400
): NextResponse {
  // The server console, not the browser's. On Vercel this is the function log.
  console.error(`[api:${action}]`, error);

  return NextResponse.json(
    { error: `Couldn't ${action}. Please try again.` },
    { status }
  );
}

/**
 * For the best-effort follow-up work that must not fail the request — creating
 * a member succeeds, then saving their team doesn't. The caller returns 200
 * with this in a `warning` field, so it needs a string rather than a response.
 */
export function serverWarning(detail: string, error: unknown): string {
  console.error(`[api:${detail}]`, error);
  return detail;
}
