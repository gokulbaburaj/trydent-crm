import test from "node:test";
import assert from "node:assert/strict";
import { formatCount, groupByPeriod } from "./goalPeriods.ts";
import type { Goal } from "./types.ts";

/*
  `period` is a free-text Input on the Goals page, so these tests are mostly
  about what happens when it isn't the "2026 Q3" the placeholder suggests.
*/

function goal(id: string, period: string | null): Goal {
  return { id, period, objective: id } as Goal;
}

test("newest period first", () => {
  const groups = groupByPeriod([
    goal("a", "2026 Q3"),
    goal("b", "2027 Q4"),
    goal("c", "2026 Q1"),
  ]);
  assert.deepEqual(
    groups.map((g) => g.period),
    ["2027 Q4", "2026 Q1", "2026 Q3"].sort().reverse()
  );
  assert.equal(groups[0].period, "2027 Q4");
});

test("goals in the same period stay in the order they arrived", () => {
  // The page sorts by sort_order before this runs, so grouping must not
  // reshuffle within a period — that's the user's own drag order.
  const groups = groupByPeriod([
    goal("first", "2026 Q3"),
    goal("second", "2026 Q3"),
    goal("third", "2026 Q3"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].goals.map((g) => g.id),
    ["first", "second", "third"]
  );
});

test("quarters sort after the bare year they belong to", () => {
  const groups = groupByPeriod([goal("a", "2026"), goal("b", "2026 Q2")]);
  // "2026 Q2" > "2026" lexicographically, so the quarter leads. That's the
  // intended read: a specific quarter is more current than the whole year.
  assert.deepEqual(
    groups.map((g) => g.period),
    ["2026 Q2", "2026"]
  );
});

test("no period sorts last", () => {
  const groups = groupByPeriod([goal("none", null), goal("dated", "2026 Q3")]);
  assert.equal(groups[0].period, "2026 Q3");
  assert.equal(groups[1].period, null);
});

test("empty and whitespace periods are the same group as null", () => {
  // Rows arrive both ways: the create form trims to "", older rows are null.
  const groups = groupByPeriod([
    goal("a", ""),
    goal("b", null),
    goal("c", "   "),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].period, null);
  assert.equal(groups[0].goals.length, 3);
});

test("free text sinks below date-shaped periods but above no period", () => {
  const groups = groupByPeriod([
    goal("a", "Summer"),
    goal("b", "2026 Q3"),
    goal("c", null),
  ]);
  assert.deepEqual(
    groups.map((g) => g.period),
    ["2026 Q3", "Summer", null]
  );
});

test("period is trimmed, so ' 2026 Q3' and '2026 Q3' are one group", () => {
  const groups = groupByPeriod([goal("a", " 2026 Q3"), goal("b", "2026 Q3")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].period, "2026 Q3");
});

test("an empty list gives no groups rather than one empty group", () => {
  assert.deepEqual(groupByPeriod([]), []);
});

test("formatCount separates thousands", () => {
  assert.equal(formatCount(600000), (600000).toLocaleString());
  assert.equal(formatCount(5), "5");
});

test("formatCount rounds to two places rather than printing float noise", () => {
  // keyResultPct divides, so values reach this as 33.333333333333336.
  assert.equal(formatCount(33.333333333333336), (33.33).toLocaleString());
  assert.equal(formatCount(0.1 + 0.2), (0.3).toLocaleString());
});
