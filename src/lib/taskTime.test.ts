import test from "node:test";
import assert from "node:assert/strict";
import {
  dayOrder,
  formatTime,
  formatTimeRange,
  gridPosition,
  isAllDay,
  minutesOf,
  startDate,
} from "./taskTime.ts";

/* ------------------------------- minutesOf ------------------------------- */

test("minutesOf parses both stored time formats", () => {
  assert.equal(minutesOf("14:30:00"), 870);
  assert.equal(minutesOf("14:30"), 870);
  assert.equal(minutesOf("00:00"), 0);
  assert.equal(minutesOf("23:59"), 1439);
});

test("minutesOf returns null for absent or unparseable values", () => {
  assert.equal(minutesOf(null), null);
  assert.equal(minutesOf(undefined), null);
  assert.equal(minutesOf(""), null);
  assert.equal(minutesOf("not a time"), null);
});

test("minutesOf distinguishes midnight from no time at all", () => {
  // The whole all-day/timed split rests on this. Midnight is 0, which is
  // falsy — anything testing `if (minutesOf(t))` instead of `!= null` treats a
  // task at 00:00 as all-day.
  assert.equal(minutesOf("00:00"), 0);
  assert.notEqual(minutesOf("00:00"), null);
});

/* ------------------------------- formatTime ------------------------------ */

test("formatTime renders 12-hour clock with the right meridiem", () => {
  assert.equal(formatTime("14:30:00"), "2:30 PM");
  assert.equal(formatTime("09:05"), "9:05 AM");
  assert.equal(formatTime("00:00"), "12:00 AM", "midnight is 12 AM, not 0 AM");
  assert.equal(formatTime("12:00"), "12:00 PM", "noon is 12 PM, not 0 PM");
  assert.equal(formatTime("23:59"), "11:59 PM");
});

test("formatTime returns an empty string when there is nothing to show", () => {
  assert.equal(formatTime(null), "");
  assert.equal(formatTime(undefined), "");
});

test("formatTimeRange falls back to the start when there is no end", () => {
  assert.equal(formatTimeRange("14:30", "16:00"), "2:30 PM – 4:00 PM");
  assert.equal(formatTimeRange("14:30", null), "2:30 PM");
  assert.equal(formatTimeRange(null, "16:00"), "", "an end without a start shows nothing");
});

/* --------------------------- all-day and ordering ------------------------ */

test("isAllDay is true only for a dated item with no time", () => {
  assert.equal(isAllDay({ due_date: "2026-08-10", due_time: null }), true);
  assert.equal(isAllDay({ due_date: "2026-08-10", due_time: "09:00" }), false);
  assert.equal(isAllDay({ due_date: null, due_time: null }), false, "undated is not all-day");
});

test("a task at midnight is timed, not all-day", () => {
  assert.equal(isAllDay({ due_date: "2026-08-10", due_time: "00:00" }), false);
});

test("dayOrder sorts all-day items above everything, including midnight", () => {
  const allDay = { due_date: "2026-08-10", due_time: null };
  const midnight = { due_date: "2026-08-10", due_time: "00:00" };
  const afternoon = { due_date: "2026-08-10", due_time: "14:00" };
  assert.ok(dayOrder(allDay) < dayOrder(midnight), "all-day sorts above 00:00");
  assert.ok(dayOrder(midnight) < dayOrder(afternoon));
});

/* ------------------------------ gridPosition ----------------------------- */

test("gridPosition returns null for all-day items", () => {
  assert.equal(gridPosition({ due_date: "2026-08-10", due_time: null }), null);
});

test("gridPosition places a block by fraction of the day", () => {
  const noon = gridPosition({ due_date: "2026-08-10", due_time: "12:00", end_time: "18:00" });
  assert.equal(noon!.topPct, 50, "noon is halfway down the day");
  assert.equal(noon!.heightPct, 25, "six hours is a quarter of the day");
});

test("gridPosition gives an untimed-end block a default height", () => {
  const pos = gridPosition({ due_date: "2026-08-10", due_time: "12:00" }, 30);
  assert.ok(pos!.heightPct > 0, "a block with no end must still be visible");
  assert.equal(pos!.heightPct, (30 / 1440) * 100);
});

test("gridPosition never renders a zero or negative height", () => {
  // An end at or before the start would otherwise collapse the block to
  // nothing and make it unclickable.
  const same = gridPosition({ due_date: "2026-08-10", due_time: "12:00", end_time: "12:00" });
  const backwards = gridPosition({ due_date: "2026-08-10", due_time: "12:00", end_time: "09:00" });
  assert.ok(same!.heightPct > 0, "equal start and end still gets a minimum height");
  assert.ok(backwards!.heightPct > 0, "an end before the start still gets a minimum height");
});

test("gridPosition clamps a block to the end of the day", () => {
  const late = gridPosition({ due_date: "2026-08-10", due_time: "23:00", end_time: "23:59" });
  assert.ok(late!.topPct + late!.heightPct <= 100.0001, "must not spill past midnight");
});

/* -------------------------------- startDate ------------------------------ */

test("startDate builds a local date, not a UTC one", () => {
  // The documented reason this function exists: `new Date("2026-08-10")` is
  // parsed as UTC midnight, which lands on the 9th for anyone behind UTC and
  // put a task on the wrong day once already.
  const d = startDate({ due_date: "2026-08-10", due_time: "14:30" })!;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7, "August is month 7");
  assert.equal(d.getDate(), 10, "must stay on the 10th in local time");
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});

test("startDate resolves an all-day item to local midnight", () => {
  const d = startDate({ due_date: "2026-08-10", due_time: null })!;
  assert.equal(d.getDate(), 10);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
});

test("startDate returns null without a usable date", () => {
  assert.equal(startDate({ due_date: null }), null);
  assert.equal(startDate({ due_date: "" }), null);
  assert.equal(startDate({ due_date: "nonsense" }), null);
});
