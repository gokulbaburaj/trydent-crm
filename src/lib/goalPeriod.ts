/**
 * A goal's window in time — chosen, not typed.
 *
 * ── The bug this replaces ───────────────────────────────────────────────────
 *
 * `goals` carried THREE independent fields for one fact: a free-text `period`
 * ("2026 Q3"), a `start_date` and an `end_date`. Nothing tied them together,
 * so they drifted immediately. In production on 11 Aug:
 *
 *   Earn 1 Lakhs          2026 Q3    17 Jul → 26 Sep   (close, hand-picked)
 *   TEAM                  2026 Q3    5 Aug  → 31 Aug   (one month, not a quarter)
 *   Save for new Computer 2027 Q4    1 Aug 2026 → 30 Dec 2027   (17 months)
 *
 * The last one is labelled as a quarter and spans a year and a half. Any pace
 * calculation reading `period` disagrees with one reading the dates, and
 * there's no way to know which the person meant.
 *
 * So the period becomes the single source of truth and the dates are derived
 * from it. You pick a quarter or a year; the bounds follow. Nothing to keep in
 * sync because there's only one input.
 *
 * `custom` exists because the computer fund is real: some goals genuinely span
 * an arbitrary range, and the honest answer is to let them say so rather than
 * mislabel themselves as a quarter. It's the only variant that stores dates
 * directly, and it's a deliberate choice rather than a silent default.
 */

export type PeriodChoice =
  | { kind: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: "year"; year: number }
  | { kind: "custom"; start: string; end: string };

export interface PeriodBounds {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Inclusive, YYYY-MM-DD — the last day that counts, not the day after. */
  end: string;
}

const QUARTER_MONTHS: Record<number, [number, number]> = {
  1: [0, 2],
  2: [3, 5],
  3: [6, 8],
  4: [9, 11],
};

function iso(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Days in a month, handling February without a Date round-trip. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function periodBounds(choice: PeriodChoice): PeriodBounds {
  if (choice.kind === "custom") {
    return { start: choice.start, end: choice.end };
  }
  if (choice.kind === "year") {
    return { start: iso(choice.year, 0, 1), end: iso(choice.year, 11, 31) };
  }
  const [firstMonth, lastMonth] = QUARTER_MONTHS[choice.quarter];
  return {
    start: iso(choice.year, firstMonth, 1),
    end: iso(choice.year, lastMonth, daysInMonth(choice.year, lastMonth)),
  };
}

/** What goes in `goals.period` — still a string, so nothing migrates. */
export function periodLabel(choice: PeriodChoice): string {
  if (choice.kind === "quarter") return `${choice.year} Q${choice.quarter}`;
  if (choice.kind === "year") return String(choice.year);
  return `${choice.start} to ${choice.end}`;
}

/**
 * Read an existing row back into a choice.
 *
 * Existing rows were free text, so this has to fail gracefully rather than
 * guess: anything that isn't a recognised shape returns null and the caller
 * falls back to the stored dates. Handles the two shapes this app has ever
 * produced ("2026 Q3", "2026") plus the custom form written above.
 */
export function parsePeriod(label: string | null | undefined): PeriodChoice | null {
  const text = (label ?? "").trim();
  if (!text) return null;

  const quarter = /^(\d{4})\s*Q([1-4])$/i.exec(text);
  if (quarter) {
    return {
      kind: "quarter",
      year: Number(quarter[1]),
      quarter: Number(quarter[2]) as 1 | 2 | 3 | 4,
    };
  }

  const year = /^(\d{4})$/.exec(text);
  if (year) return { kind: "year", year: Number(year[1]) };

  const custom = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(text);
  if (custom) return { kind: "custom", start: custom[1], end: custom[2] };

  return null;
}

/** The quarter a date falls in — the default when creating a goal. */
export function quarterOf(date: Date): PeriodChoice {
  return {
    kind: "quarter",
    year: date.getFullYear(),
    quarter: (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  };
}

/**
 * The next quarter after this one — what the rollover prompt offers.
 *
 * Q4 wraps to Q1 of the following year, which is the case a naive `+1`
 * gets wrong.
 */
export function nextQuarter(choice: PeriodChoice): PeriodChoice {
  if (choice.kind !== "quarter") return choice;
  if (choice.quarter === 4) return { kind: "quarter", year: choice.year + 1, quarter: 1 };
  return {
    kind: "quarter",
    year: choice.year,
    quarter: (choice.quarter + 1) as 1 | 2 | 3 | 4,
  };
}

/** Years offered in the picker: last year through four ahead. */
export function yearOptions(now: Date): number[] {
  const y = now.getFullYear();
  return [y - 1, y, y + 1, y + 2, y + 3, y + 4];
}
