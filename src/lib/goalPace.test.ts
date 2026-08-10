import test from "node:test";
import assert from "node:assert/strict";
import {
  daysRemaining,
  expectedFraction,
  isStalled,
  paceOf,
  runRate,
  shouldOfferRollover,
} from "./goalPace.ts";

const at = (s: string) => new Date(`${s}T12:00:00`).getTime();

/* Q3 2026 throughout, so the numbers stay checkable by hand: 1 Jul → 30 Sep
   is 91 days, and 11 Aug is day 41 of it. */
const Q3_START = "2026-07-01";
const Q3_END = "2026-09-30";

test("expected fraction is 0 before the window opens", () => {
  assert.equal(expectedFraction(Q3_START, Q3_END, at("2026-06-30")), 0);
  assert.equal(expectedFraction(Q3_START, Q3_END, at("2026-01-01")), 0);
});

test("expected fraction is 1 once the window closes", () => {
  assert.equal(expectedFraction(Q3_START, Q3_END, at("2026-09-30")), 1);
  assert.equal(expectedFraction(Q3_START, Q3_END, at("2026-12-01")), 1);
});

test("expected fraction is proportional inside the window", () => {
  const f = expectedFraction(Q3_START, Q3_END, at("2026-08-15"));
  assert.ok(f !== null);
  // 45 of 91 days.
  assert.ok(Math.abs(f - 45 / 91) < 0.001, `got ${f}`);
});

test("expected fraction is null when either date is missing", () => {
  assert.equal(expectedFraction(null, Q3_END, at("2026-08-11")), null);
  assert.equal(expectedFraction(Q3_START, null, at("2026-08-11")), null);
  assert.equal(expectedFraction(null, null, at("2026-08-11")), null);
});

test("a window ending before it starts is refused, not inverted", () => {
  // Bad data. Dividing by a negative span produces a plausible-looking
  // fraction, which is worse than admitting we don't know.
  assert.equal(expectedFraction("2026-09-30", "2026-07-01", at("2026-08-11")), null);
});

test("a single-day window is 0 before and 1 on the day", () => {
  assert.equal(expectedFraction("2026-08-11", "2026-08-11", at("2026-08-10")), 0);
  assert.equal(expectedFraction("2026-08-11", "2026-08-11", at("2026-08-11")), 1);
});

test("timezone: a start date is not 'yesterday' west of UTC", () => {
  // Parsing "2026-07-01" as UTC midnight then reading it in UTC-5 lands on
  // 30 June, which shifted every boundary by a day. Noon local avoids it.
  assert.equal(expectedFraction("2026-07-01", "2026-09-30", at("2026-07-01")), 0);
});

test("days remaining counts to the end date and floors at zero", () => {
  assert.equal(daysRemaining(Q3_END, at("2026-09-30")), 0);
  assert.equal(daysRemaining(Q3_END, at("2026-09-23")), 7);
  assert.equal(daysRemaining(Q3_END, at("2026-10-15")), 0);
  assert.equal(daysRemaining(null, at("2026-08-11")), null);
});

test("undated goals get no verdict", () => {
  const p = paceOf(13, null, null, at("2026-08-11"));
  assert.equal(p.status, "undated");
  assert.equal(p.deltaPoints, null);
  assert.equal(p.expected, null);
});

test("reaching the target wins, even early", () => {
  assert.equal(paceOf(100, Q3_START, Q3_END, at("2026-07-05")).status, "achieved");
  assert.equal(paceOf(140, Q3_START, Q3_END, at("2026-08-11")).status, "achieved");
});

test("a goal whose window hasn't opened is not_started, not off_track", () => {
  // This is the "Save for new Computer" case: 0% on a future goal is fine.
  const p = paceOf(0, "2027-10-01", "2027-12-31", at("2026-08-11"));
  assert.equal(p.status, "not_started");
  assert.equal(p.deltaPoints, null);
});

test("the real Q3 goal: 13% on 11 Aug is off track", () => {
  const p = paceOf(13, Q3_START, Q3_END, at("2026-08-11"));
  assert.equal(p.status, "off_track");
  // 41 of 91 days ≈ 45%; 13 − 45 = −32.
  assert.equal(p.deltaPoints, -32);
  assert.equal(p.daysLeft, 50);
});

test("thresholds: on_track, at_risk and off_track split where documented", () => {
  const mid = at("2026-08-15"); // ≈ 49.45% expected
  // Within 5 points behind.
  assert.equal(paceOf(46, Q3_START, Q3_END, mid).status, "on_track");
  // Ahead is obviously on track.
  assert.equal(paceOf(80, Q3_START, Q3_END, mid).status, "on_track");
  // Between 5 and 20 behind.
  assert.equal(paceOf(35, Q3_START, Q3_END, mid).status, "at_risk");
  // More than 20 behind.
  assert.equal(paceOf(10, Q3_START, Q3_END, mid).status, "off_track");
});

test("a closed window short of target is missed, not off_track", () => {
  // "Off track" implies there's still time to fix it. There isn't.
  const p = paceOf(60, Q3_START, Q3_END, at("2026-10-05"));
  assert.equal(p.status, "missed");
  assert.equal(p.daysLeft, 0);
  assert.ok(shouldOfferRollover(p));
});

test("rollover is only offered for missed goals", () => {
  for (const pct of [0, 13, 99]) {
    assert.equal(
      shouldOfferRollover(paceOf(pct, Q3_START, Q3_END, at("2026-08-11"))),
      false
    );
  }
  assert.equal(
    shouldOfferRollover(paceOf(100, Q3_START, Q3_END, at("2026-10-05"))),
    false
  );
});

test("run rate divides what's left by the weeks left", () => {
  const r = runRate(25000, 200000, 50);
  assert.equal(r.remaining, 175000);
  assert.equal(r.weeksLeft, 7);
  assert.equal(r.perWeek, 25000);
});

test("run rate never divides by a fraction of a week", () => {
  // Three days left: naive division by 3/7 reports 2.3x the real figure.
  const r = runRate(0, 700, 3);
  assert.equal(r.weeksLeft, 1);
  assert.equal(r.perWeek, 700);
});

test("run rate is null once the target is met or time is up", () => {
  assert.equal(runRate(200000, 200000, 50).perWeek, null);
  assert.equal(runRate(250000, 200000, 50).remaining, 0);
  assert.equal(runRate(0, 100, 0).perWeek, null);
  assert.equal(runRate(0, 100, null).perWeek, null);
});

test("stalled only applies to manual measures", () => {
  const now = at("2026-08-11");
  const old = "2026-07-01T00:00:00Z";
  assert.equal(isStalled("manual", old, now), true);
  // An auto measure reads live data; its row being old means nothing.
  assert.equal(isStalled("revenue_won", old, now), false);
});

test("stalled needs more than three weeks of silence", () => {
  const now = at("2026-08-11");
  assert.equal(isStalled("manual", "2026-08-01T00:00:00Z", now), false);
  assert.equal(isStalled("manual", "2026-07-15T00:00:00Z", now), true);
});

test("stalled is false when the timestamp is missing or unparseable", () => {
  const now = at("2026-08-11");
  assert.equal(isStalled("manual", null, now), false);
  assert.equal(isStalled("manual", "not a date", now), false);
});
