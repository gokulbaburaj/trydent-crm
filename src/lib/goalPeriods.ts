import type { Goal } from "@/lib/types";

/**
 * Group goals under their period, newest period first.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Goals came back ordered by `sort_order` alone, so periods interleaved: a
 * 2027 Q4 goal sat between two 2026 Q3 goals with nothing to explain why. The
 * page already had a period *filter*, which is the wrong tool — filtering
 * makes you pick one period to see anything coherent, when the natural read is
 * "this quarter, then last quarter".
 *
 * Sorting is lexicographic on the period string, descending, which is correct
 * for the "YYYY Qn" shape the page generates and stays correct for plain years
 * and ISO dates. It is wrong for free text, and `period` is a free-text Input
 * — someone can type "Summer". Rather than pretend otherwise, anything that
 * doesn't parse sorts to the bottom in a stable clump. A goal with no period
 * at all goes last, under a null key.
 */

const PERIOD_SHAPE = /^\d{4}(\s+Q[1-4])?$/;

export interface PeriodGroup {
  /** null means "no period set" — rendered as a plain divider, not a heading. */
  period: string | null;
  goals: Goal[];
}

export function groupByPeriod(goals: Goal[]): PeriodGroup[] {
  const byPeriod = new Map<string | null, Goal[]>();

  for (const goal of goals) {
    // Empty string and null both mean "not set". They arrive as both: the
    // create form trims to "" and older rows are null.
    const key = goal.period?.trim() ? goal.period.trim() : null;
    const list = byPeriod.get(key);
    if (list) list.push(goal);
    else byPeriod.set(key, [goal]);
  }

  const groups: PeriodGroup[] = Array.from(byPeriod, ([period, list]) => ({
    period,
    goals: list,
  }));

  groups.sort((a, b) => {
    // No period always last, whatever it's next to.
    if (a.period === null) return 1;
    if (b.period === null) return -1;

    const aParses = PERIOD_SHAPE.test(a.period);
    const bParses = PERIOD_SHAPE.test(b.period);
    // Free text sinks below anything date-shaped, but keeps its relative
    // order rather than shuffling on every render.
    if (aParses !== bParses) return aParses ? -1 : 1;
    if (!aParses) return a.period.localeCompare(b.period);

    return b.period.localeCompare(a.period);
  });

  return groups;
}

/**
 * Thousands separators for a plain count.
 *
 * `String(600000)` next to an input containing `600000` is six digits the eye
 * has to count. Money already goes through `formatCurrency`; this is the
 * everything-else case, and it deliberately does NOT touch the input's own
 * value — a separator inside a `type="number"` field makes it invalid and the
 * browser silently blanks it.
 */
export function formatCount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
