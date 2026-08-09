import type { Client, ClientStatus } from "./types";

/**
 * How warm a client is, and which time bucket they fall in.
 *
 * Lives here rather than in ClientFocusView because it's pure date and
 * weighting maths, and this project's rule is that pure logic gets a test
 * rather than a throwaway script. It was written in the component first and
 * lifted out unchanged — same rule as lib/calendarLayout.ts.
 */

/**
 * Pipeline order. Distinct from CLIENT_STATUSES, which says what a status can
 * BE but not what order they happen in.
 */
export const STAGE_ORDER: ClientStatus[] = [
  "Lead",
  "Prospect",
  "Active Customer",
  "Inactive Customer",
];

/** Contact recency stops contributing past this. */
export const RECENCY_HORIZON_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * A 0..100 warmth score, for the heat scale.
 *
 * There is no lead-score column in the database, and adding one would be a
 * schema change made to support a colour. This derives the same signal from
 * what already exists: where they are in the pipeline, and how recently anyone
 * spoke to them.
 *
 * Weighted 60/40 toward stage — a Lead contacted yesterday is still a lead.
 * The recency half decays linearly over 90 days and then contributes nothing,
 * because "no contact in three months" and "no contact in three years" are the
 * same problem and there's no value in ranking them against each other.
 */
export function clientScore(client: Client, now: number): number {
  return Math.round((stageWeight(client.status) * 0.6 + recencyWeight(client.last_contact, now) * 0.4) * 100);
}

/**
 * Stage as a 0..1 weight.
 *
 * "Inactive Customer" is LAST in the pipeline and COLDEST in temperature — it
 * is an exit, not a peak. Reading the weight off the array index is the
 * obvious implementation and it ranks a churned account above an active one,
 * which is the bug this function exists to not have.
 */
export function stageWeight(status: ClientStatus): number {
  if (status === "Inactive Customer") return 0;
  const i = STAGE_ORDER.indexOf(status);
  if (i <= 0) return 0.34; // Lead, and anything unrecognised
  if (i === 1) return 0.67; // Prospect
  return 1; // Active Customer
}

/** Contact recency as a 0..1 weight, decaying over RECENCY_HORIZON_DAYS. */
export function recencyWeight(lastContact: string | null, now: number): number {
  if (!lastContact) return 0;
  const then = new Date(lastContact).getTime();
  if (!Number.isFinite(then)) return 0;
  const days = (now - then) / DAY_MS;
  // Clamped at both ends: a future-dated last_contact is bad data, not a
  // reason to score above 100.
  return Math.max(0, Math.min(1, 1 - days / RECENCY_HORIZON_DAYS));
}

/**
 * Time bucket for the queue's dividers — the reference's "Today" /
 * "3 weeks ago" rules.
 *
 * Floored, not rounded. Something 20 hours old belongs in "Today" until the
 * day actually turns; rounding would push it to "Yesterday" before it is.
 */
export function bucketOf(iso: string | null, now: number): string {
  if (!iso) return "No contact yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "No contact yet";
  const days = Math.floor((now - then) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  if (days < RECENCY_HORIZON_DAYS) return "Last 3 months";
  return "Older";
}

/** Word for a score, used beside the chip. Kept next to the maths so the two can't drift. */
export function warmthLabel(score: number): "Warm" | "Steady" | "Cold" {
  if (score >= 75) return "Warm";
  if (score >= 40) return "Steady";
  return "Cold";
}
