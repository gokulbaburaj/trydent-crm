import type { CurrencyCode } from "./types";

/**
 * Who is owed what.
 *
 * ── The inversion ───────────────────────────────────────────────────────────
 *
 * The Accounts page asked "what is this project worth, and what's committed
 * out of it". That's the right question when you're pricing work and the wrong
 * one when you're paying people: you don't pay a project, you pay Ravi once
 * for three things across two projects.
 *
 * So the same rows get grouped by person instead of by project, and the two
 * tables that both mean "money owed to someone" — `project_allocations` and
 * `staff_payments` — are read together. They were never reconciled anywhere,
 * which is why the old header totals only counted the first and understated
 * what was actually owed.
 *
 * Nothing here touches the database. The page assembles `OwedLine[]` from
 * whatever it has loaded and these functions do the arithmetic, which is the
 * only part worth testing.
 */

export type LineKind = "allocation" | "payment";

export interface OwedLine {
  id: string;
  kind: LineKind;
  personId: string;
  /** What it's for — a project name, or a one-off payment's label. */
  label: string;
  /** Role, basis, due date — whatever qualifies the line. */
  sublabel: string | null;
  /** In `currency`, not converted. */
  amount: number;
  currency: CurrencyCode;
  paid: boolean;
}

export interface PersonOwed {
  personId: string;
  lines: OwedLine[];
  /** Converted to the base currency, so people are comparable. */
  total: number;
}

/**
 * What an allocation is actually worth.
 *
 * A percentage line is a share of the project's budget and recalculates when
 * the deal value moves — that's the point of using one. A fixed line is its
 * own number. `percent` wins when both are set, which matches the column
 * comment and what the old page did.
 *
 * A percentage of an unknown budget is 0, not NaN: a project with no deal and
 * no budget genuinely owes nothing yet, and NaN would poison every total it
 * touched.
 */
export function allocationAmount(
  allocation: { amount: number | string | null; percent: number | string | null },
  budget: number
): number {
  const percent = allocation.percent === null ? null : Number(allocation.percent);
  if (percent !== null && Number.isFinite(percent)) {
    if (!Number.isFinite(budget)) return 0;
    return (budget * percent) / 100;
  }
  const fixed = Number(allocation.amount);
  return Number.isFinite(fixed) ? fixed : 0;
}

/**
 * Group unpaid lines by person, biggest debt first.
 *
 * Paid lines are dropped rather than kept with a flag — this list answers
 * "who do I owe", and a settled line is not part of that answer. History lives
 * in `payouts`, which is a record of what left rather than a filtered view of
 * what hasn't.
 *
 * @param toBase converts an amount from its own currency to the base one.
 *   Passed in because the rates live in a React hook the tests can't call.
 */
export function groupOwedByPerson(
  lines: OwedLine[],
  toBase: (amount: number, from: CurrencyCode) => number
): PersonOwed[] {
  const byPerson = new Map<string, OwedLine[]>();
  for (const line of lines) {
    if (line.paid) continue;
    // A zero line is real data (an allocation someone hasn't priced yet) but
    // it isn't a debt, and it would pad the list with people owed nothing.
    if (line.amount === 0) continue;
    const list = byPerson.get(line.personId);
    if (list) list.push(line);
    else byPerson.set(line.personId, [line]);
  }

  return Array.from(byPerson, ([personId, personLines]) => ({
    personId,
    lines: personLines,
    total: personLines.reduce((sum, l) => sum + toBase(l.amount, l.currency), 0),
  })).sort((a, b) => b.total - a.total);
}

export interface PayoutTotals {
  thisMonth: number;
  lastMonth: number;
  allTime: number;
}

/**
 * Paid-out figures, in the base currency.
 *
 * `paidOn` is a plain YYYY-MM-DD, so the month is compared as a string prefix
 * rather than through Date. Parsing "2026-08-01" and calling getMonth() reads
 * it in the viewer's timezone, and west of UTC that lands in July — the same
 * off-by-one that had the goals date picker defaulting to yesterday.
 */
export function payoutTotals(
  payouts: { paidOn: string; amount: number; currency: CurrencyCode }[],
  now: Date,
  toBase: (amount: number, from: CurrencyCode) => number
): PayoutTotals {
  const y = now.getFullYear();
  const m = now.getMonth();
  const thisKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev = new Date(y, m - 1, 1);
  const lastKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  let thisMonth = 0;
  let lastMonth = 0;
  let allTime = 0;

  for (const p of payouts) {
    const value = toBase(p.amount, p.currency);
    allTime += value;
    if (p.paidOn.startsWith(thisKey)) thisMonth += value;
    else if (p.paidOn.startsWith(lastKey)) lastMonth += value;
  }

  return { thisMonth, lastMonth, allTime };
}

/**
 * Month-on-month change as a percentage, or null when there's nothing to
 * compare against.
 *
 * Null rather than 0 or Infinity for a zero baseline: "up 100%" from nothing
 * is a claim the data doesn't support, and the caller should say "no payouts
 * last month" instead of printing a number.
 */
export function monthOverMonth(totals: PayoutTotals): number | null {
  if (totals.lastMonth === 0) return null;
  return Math.round(((totals.thisMonth - totals.lastMonth) / totals.lastMonth) * 100);
}
