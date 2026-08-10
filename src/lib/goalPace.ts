/**
 * Is this goal going to make it?
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The page showed a percentage and a hand-picked status, and the two had no
 * relationship. A goal could read "13%" and "On track" at the same time,
 * because someone chose "On track" from a dropdown in July and never came
 * back. A status nobody maintains is worse than no status: it looks like
 * information.
 *
 * Everything here is derived from two numbers — where you are, and where you'd
 * be if progress were even across the goal's window. The gap between them is
 * the status. It can't go stale and it can't contradict the bar next to it.
 *
 * ── The assumption, stated ──────────────────────────────────────────────────
 *
 * Linear pace. Revenue doesn't actually arrive evenly across a quarter, so a
 * goal that lands most of its deals in September will look "off track" through
 * August and then finish fine.
 *
 * That's a real limitation and the alternative is worse: modelling seasonality
 * needs history this app doesn't record (there are no progress snapshots, only
 * the current value). A linear expectation is a reasonable prior, it's
 * explainable in one sentence to whoever's looking at it, and the run-rate
 * figure below turns it into something actionable rather than a verdict.
 */

const DAY_MS = 86_400_000;

/** Behind by this much or less is still on track. */
export const AT_RISK_POINTS = 5;
/** Behind by more than this is off track. */
export const OFF_TRACK_POINTS = 20;
/** A manual measure untouched for this long is probably abandoned. */
export const STALE_DAYS = 21;

export type PaceStatus =
  | "not_started"
  | "on_track"
  | "at_risk"
  | "off_track"
  | "achieved"
  | "missed"
  | "undated";

export interface Pace {
  status: PaceStatus;
  /** 0..1, or null when there are no usable dates. */
  expected: number | null;
  /** actual − expected, in percentage points. Null when undated. */
  deltaPoints: number | null;
  /** Whole days remaining, floored at 0. Null when undated. */
  daysLeft: number | null;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseDay(value: string | null | undefined): number | null {
  if (!value) return null;
  // Midday, deliberately. Parsing "2026-07-01" as UTC midnight and reading it
  // in a negative-offset timezone lands on 30 June, shifting every boundary by
  // a day. Noon local is the same calendar day everywhere.
  const t = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * How far through the window we are, 0..1.
 *
 * Clamped at both ends: before the start is 0 (nothing has been asked of the
 * goal yet), after the end is 1 (all of it has).
 */
export function expectedFraction(
  start: string | null | undefined,
  end: string | null | undefined,
  now: number
): number | null {
  const s = parseDay(start);
  const e = parseDay(end);
  if (s === null || e === null) return null;
  // A window that ends before it starts is bad data, not a 0-length goal —
  // refusing to guess is better than dividing by a negative.
  if (e < s) return null;
  if (e === s) return now >= s ? 1 : 0;
  const t = startOfDay(now) + DAY_MS / 2;
  if (t <= s) return 0;
  if (t >= e) return 1;
  return (t - s) / (e - s);
}

export function daysRemaining(
  end: string | null | undefined,
  now: number
): number | null {
  const e = parseDay(end);
  if (e === null) return null;
  return Math.max(0, Math.round((e - (startOfDay(now) + DAY_MS / 2)) / DAY_MS));
}

/**
 * @param actualPct 0..100, already computed by `goalPct`.
 */
export function paceOf(
  actualPct: number,
  start: string | null | undefined,
  end: string | null | undefined,
  now: number
): Pace {
  const expected = expectedFraction(start, end, now);
  const daysLeft = daysRemaining(end, now);

  if (expected === null) {
    // No usable window. Say so rather than inventing a verdict — this is the
    // free-text-period case, and pretending it's "on track" is the exact lie
    // the manual dropdown used to tell.
    return { status: "undated", expected: null, deltaPoints: null, daysLeft: null };
  }

  // Hitting the target wins regardless of timing, including early.
  if (actualPct >= 100) {
    return { status: "achieved", expected, deltaPoints: null, daysLeft };
  }

  // Not started: the window hasn't opened, so being at 0 isn't a failure.
  if (expected === 0) {
    return { status: "not_started", expected, deltaPoints: null, daysLeft };
  }

  // Window closed without reaching the target. "Off track" implies there's
  // still time; there isn't.
  if (expected === 1 && daysLeft === 0) {
    return { status: "missed", expected, deltaPoints: actualPct - 100, daysLeft };
  }

  const deltaPoints = Math.round(actualPct - expected * 100);
  const behind = -deltaPoints;

  const status: PaceStatus =
    behind <= AT_RISK_POINTS
      ? "on_track"
      : behind <= OFF_TRACK_POINTS
        ? "at_risk"
        : "off_track";

  return { status, expected, deltaPoints, daysLeft };
}

export interface RunRate {
  /** Units still needed. */
  remaining: number;
  /** Units per week to finish on time, or null when there's no time left. */
  perWeek: number | null;
  /** Whole weeks remaining, minimum 1 while any day remains. */
  weeksLeft: number | null;
}

/**
 * What it takes from here.
 *
 * "₹25,000 a week" is a thing you can act on. "13%" is not — that's the whole
 * argument for this function.
 *
 * Weeks are floored at 1 while any day remains, so the last few days say
 * "₹175,000 this week" rather than dividing by a fraction and reporting a
 * number ten times too large.
 */
export function runRate(
  current: number,
  target: number,
  daysLeft: number | null
): RunRate {
  const remaining = Math.max(0, target - current);
  if (daysLeft === null || remaining === 0) {
    return { remaining, perWeek: null, weeksLeft: daysLeft === null ? null : Math.ceil(daysLeft / 7) };
  }
  if (daysLeft === 0) return { remaining, perWeek: null, weeksLeft: 0 };
  const weeksLeft = Math.max(1, Math.round(daysLeft / 7));
  return { remaining, perWeek: remaining / weeksLeft, weeksLeft };
}

/**
 * A manual measure nobody has touched in three weeks.
 *
 * Only manual ones — an auto-tracked goal reads live data, so its row can be
 * weeks old and still be current. Flagging those would be noise, and noise is
 * how a warning stops meaning anything.
 */
export function isStalled(
  source: string,
  updatedAt: string | null | undefined,
  now: number
): boolean {
  if (source !== "manual") return false;
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > STALE_DAYS * DAY_MS;
}

/**
 * True when a goal's window has closed and it didn't get there — the trigger
 * for offering to roll it into the next period.
 */
export function shouldOfferRollover(pace: Pace): boolean {
  return pace.status === "missed";
}
