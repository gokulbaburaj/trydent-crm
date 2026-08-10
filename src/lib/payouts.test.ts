import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationAmount,
  groupOwedByPerson,
  monthOverMonth,
  payoutTotals,
  type OwedLine,
} from "./payouts.ts";
import type { CurrencyCode } from "./types";

/** Identity rates — currency conversion is the hook's job, not this module's. */
const same = (amount: number) => amount;
/** A rate table with a real conversion, to prove totals go through it. */
const inr = (amount: number, from: CurrencyCode) => (from === "USD" ? amount * 80 : amount);

function line(over: Partial<OwedLine> & { personId: string; amount: number }): OwedLine {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "allocation",
    label: "Project",
    sublabel: null,
    currency: "INR",
    paid: false,
    ...over,
  };
}

test("a percentage line is a share of the budget", () => {
  assert.equal(allocationAmount({ amount: 0, percent: 30 }, 65000), 19500);
  assert.equal(allocationAmount({ amount: 0, percent: 100 }, 65000), 65000);
});

test("percent wins when both are set", () => {
  // The column comment says so, and the old page behaved this way — a fixed
  // amount left over from before someone switched to a share must not win.
  assert.equal(allocationAmount({ amount: 99999, percent: 10 }, 1000), 100);
});

test("a fixed line ignores the budget entirely", () => {
  assert.equal(allocationAmount({ amount: 35000, percent: null }, 0), 35000);
  assert.equal(allocationAmount({ amount: 35000, percent: null }, 999999), 35000);
});

test("a percentage of an unknown budget is 0, not NaN", () => {
  // A project with no deal and no budget owes nothing yet. NaN would spread
  // into every total that touched it and render as "₹NaN".
  assert.equal(allocationAmount({ amount: 0, percent: 30 }, Number.NaN), 0);
  assert.equal(allocationAmount({ amount: 0, percent: 30 }, 0), 0);
});

test("numeric strings from Postgres are handled", () => {
  // supabase-js returns `numeric` as a string; a bare + would concatenate.
  assert.equal(allocationAmount({ amount: "35000", percent: null }, 0), 35000);
  assert.equal(allocationAmount({ amount: "0", percent: "30" }, 1000), 300);
});

test("owed lines group by person, biggest first", () => {
  const groups = groupOwedByPerson(
    [
      line({ personId: "a", amount: 100 }),
      line({ personId: "b", amount: 500 }),
      line({ personId: "a", amount: 50 }),
    ],
    same
  );
  assert.deepEqual(
    groups.map((g) => [g.personId, g.total]),
    [
      ["b", 500],
      ["a", 150],
    ]
  );
});

test("paid lines are dropped, not flagged", () => {
  const groups = groupOwedByPerson(
    [line({ personId: "a", amount: 100, paid: true }), line({ personId: "a", amount: 40 })],
    same
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total, 40);
  assert.equal(groups[0].lines.length, 1);
});

test("a person whose lines are all paid disappears from the list", () => {
  const groups = groupOwedByPerson([line({ personId: "a", amount: 100, paid: true })], same);
  assert.deepEqual(groups, []);
});

test("zero-value lines don't put someone on the owed list", () => {
  // An unpriced allocation is real data but not a debt.
  const groups = groupOwedByPerson([line({ personId: "a", amount: 0 })], same);
  assert.deepEqual(groups, []);
});

test("totals convert, line amounts don't", () => {
  const groups = groupOwedByPerson(
    [line({ personId: "a", amount: 100, currency: "USD" })],
    inr
  );
  assert.equal(groups[0].total, 8000);
  // The line keeps its own currency so the row can render "$100".
  assert.equal(groups[0].lines[0].amount, 100);
});

test("an empty list gives no groups", () => {
  assert.deepEqual(groupOwedByPerson([], same), []);
});

const AUG = new Date(2026, 7, 11);

test("payout totals split this month, last month and all time", () => {
  const totals = payoutTotals(
    [
      { paidOn: "2026-08-02", amount: 100, currency: "INR" },
      { paidOn: "2026-08-30", amount: 50, currency: "INR" },
      { paidOn: "2026-07-26", amount: 200, currency: "INR" },
      { paidOn: "2026-01-01", amount: 7, currency: "INR" },
    ],
    AUG,
    same
  );
  assert.deepEqual(totals, { thisMonth: 150, lastMonth: 200, allTime: 357 });
});

test("the month boundary is read as a string, not through Date", () => {
  // new Date("2026-08-01") is UTC midnight; west of UTC that reads as 31 July
  // and the payout lands in the wrong month. Prefix matching can't drift.
  const totals = payoutTotals([{ paidOn: "2026-08-01", amount: 10, currency: "INR" }], AUG, same);
  assert.equal(totals.thisMonth, 10);
  assert.equal(totals.lastMonth, 0);
});

test("January compares against December of the previous year", () => {
  const totals = payoutTotals(
    [
      { paidOn: "2026-01-05", amount: 10, currency: "INR" },
      { paidOn: "2025-12-20", amount: 40, currency: "INR" },
    ],
    new Date(2026, 0, 15),
    same
  );
  assert.equal(totals.thisMonth, 10);
  assert.equal(totals.lastMonth, 40);
});

test("payout totals convert through the rate function", () => {
  const totals = payoutTotals([{ paidOn: "2026-08-02", amount: 100, currency: "USD" }], AUG, inr);
  assert.equal(totals.thisMonth, 8000);
});

test("month over month is null when there's no baseline", () => {
  // "Up 100%" from nothing is a claim the data doesn't support.
  assert.equal(monthOverMonth({ thisMonth: 500, lastMonth: 0, allTime: 500 }), null);
  assert.equal(monthOverMonth({ thisMonth: 0, lastMonth: 0, allTime: 0 }), null);
});

test("month over month reports the change both ways", () => {
  assert.equal(monthOverMonth({ thisMonth: 120, lastMonth: 100, allTime: 220 }), 20);
  assert.equal(monthOverMonth({ thisMonth: 50, lastMonth: 100, allTime: 150 }), -50);
});
