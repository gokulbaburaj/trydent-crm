import test from "node:test";
import assert from "node:assert/strict";
import { formatDate, initials } from "./format.ts";

/** Tests run with TZ=UTC (see the `test` script) so dates are deterministic. */

test("formatDate renders a readable US date", () => {
  assert.equal(formatDate("2026-08-10"), "Aug 10, 2026");
  assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDate("2026-12-31T23:59:00Z"), "Dec 31, 2026");
});

test("formatDate shows an em dash rather than a blank for missing values", () => {
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate(undefined), "—");
  assert.equal(formatDate(""), "—");
});

test("formatDate never throws on rubbish input", () => {
  // It's rendered straight into tables, so a throw here blanks a whole page.
  assert.doesNotThrow(() => formatDate("not a date"));
  assert.doesNotThrow(() => formatDate("2026-13-45"));
});

test("KNOWN: a date-only string is parsed as UTC, so it shifts west of UTC", () => {
  // Documenting current behaviour, not endorsing it. `new Date("2026-08-10")`
  // is UTC midnight, so anyone in a negative-offset timezone sees the 9th.
  // Harmless at UTC+5:30, wrong for a US-based user. lib/taskTime.ts already
  // solves this by building dates from parts; formatDate does not.
  // If this test starts failing, someone fixed it — update the expectation.
  const utcMidnight = new Date("2026-08-10").toISOString();
  assert.equal(utcMidnight, "2026-08-10T00:00:00.000Z");
});

test("initials takes the first and last name", () => {
  assert.equal(initials("Gokul Baburaj"), "GB");
  assert.equal(initials("Ada Lovelace King"), "AK", "first and last, not first and second");
});

test("initials falls back to two letters for a single name", () => {
  assert.equal(initials("Gokul"), "GO");
  assert.equal(initials("Jo"), "JO");
  assert.equal(initials("X"), "X", "a one-letter name gives one letter");
});

test("initials handles messy spacing", () => {
  assert.equal(initials("  Gokul   Baburaj  "), "GB");
});

test("initials returns a question mark rather than empty", () => {
  // Renders inside an avatar circle — an empty string is a visible hole.
  assert.equal(initials(null), "?");
  assert.equal(initials(undefined), "?");
  assert.equal(initials(""), "?");
  assert.equal(initials("   "), "?");
});
