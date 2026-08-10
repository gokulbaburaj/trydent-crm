import test from "node:test";
import assert from "node:assert/strict";
import {
  nextQuarter,
  parsePeriod,
  periodBounds,
  periodLabel,
  quarterOf,
  yearOptions,
} from "./goalPeriod.ts";

test("quarter bounds cover the whole quarter, inclusive", () => {
  assert.deepEqual(periodBounds({ kind: "quarter", year: 2026, quarter: 3 }), {
    start: "2026-07-01",
    end: "2026-09-30",
  });
  assert.deepEqual(periodBounds({ kind: "quarter", year: 2026, quarter: 1 }), {
    start: "2026-01-01",
    end: "2026-03-31",
  });
  assert.deepEqual(periodBounds({ kind: "quarter", year: 2026, quarter: 4 }), {
    start: "2026-10-01",
    end: "2026-12-31",
  });
});

test("Q1 ends on the right day in a leap year", () => {
  // 2028 is a leap year; 2026 is not. Hardcoding 31 March would hide this,
  // but hardcoding 28 February in any Q1 helper would not.
  assert.equal(periodBounds({ kind: "quarter", year: 2028, quarter: 1 }).end, "2028-03-31");
  // February matters for a custom month-long window, which is why
  // daysInMonth exists rather than a lookup table.
  assert.equal(periodBounds({ kind: "year", year: 2028 }).end, "2028-12-31");
});

test("year bounds span January to December", () => {
  assert.deepEqual(periodBounds({ kind: "year", year: 2027 }), {
    start: "2027-01-01",
    end: "2027-12-31",
  });
});

test("custom bounds pass through untouched", () => {
  assert.deepEqual(
    periodBounds({ kind: "custom", start: "2026-08-01", end: "2027-12-30" }),
    { start: "2026-08-01", end: "2027-12-30" }
  );
});

test("labels round-trip through parsePeriod", () => {
  const cases = [
    { kind: "quarter", year: 2026, quarter: 3 },
    { kind: "year", year: 2027 },
    { kind: "custom", start: "2026-08-01", end: "2027-12-30" },
  ] as const;
  for (const choice of cases) {
    assert.deepEqual(parsePeriod(periodLabel(choice)), choice);
  }
});

test("parsePeriod reads the labels already in production", () => {
  assert.deepEqual(parsePeriod("2026 Q3"), { kind: "quarter", year: 2026, quarter: 3 });
  assert.deepEqual(parsePeriod("2027 Q4"), { kind: "quarter", year: 2027, quarter: 4 });
});

test("parsePeriod tolerates spacing and case", () => {
  assert.deepEqual(parsePeriod("2026Q3"), { kind: "quarter", year: 2026, quarter: 3 });
  assert.deepEqual(parsePeriod("  2026 q3  "), { kind: "quarter", year: 2026, quarter: 3 });
});

test("parsePeriod returns null for free text rather than guessing", () => {
  // `period` was a plain Input for months, so anything could be in there.
  // Guessing a quarter from "Summer" would silently invent a window.
  for (const junk of ["Summer", "", "   ", "Q3", "2026 Q5", "26 Q3", null, undefined]) {
    assert.equal(parsePeriod(junk), null, `expected null for ${JSON.stringify(junk)}`);
  }
});

test("quarterOf picks the quarter a date sits in", () => {
  assert.deepEqual(quarterOf(new Date(2026, 0, 15)), { kind: "quarter", year: 2026, quarter: 1 });
  assert.deepEqual(quarterOf(new Date(2026, 7, 11)), { kind: "quarter", year: 2026, quarter: 3 });
  assert.deepEqual(quarterOf(new Date(2026, 11, 31)), { kind: "quarter", year: 2026, quarter: 4 });
});

test("nextQuarter wraps Q4 into the following year", () => {
  assert.deepEqual(nextQuarter({ kind: "quarter", year: 2026, quarter: 3 }), {
    kind: "quarter",
    year: 2026,
    quarter: 4,
  });
  // The case a naive +1 gets wrong.
  assert.deepEqual(nextQuarter({ kind: "quarter", year: 2026, quarter: 4 }), {
    kind: "quarter",
    year: 2027,
    quarter: 1,
  });
});

test("nextQuarter leaves non-quarter periods alone", () => {
  const y = { kind: "year", year: 2026 } as const;
  assert.deepEqual(nextQuarter(y), y);
});

test("yearOptions covers last year through four ahead", () => {
  assert.deepEqual(yearOptions(new Date(2026, 7, 11)), [2025, 2026, 2027, 2028, 2029, 2030]);
});
