import test from "node:test";
import assert from "node:assert/strict";
import { composeObjective, defaultMeasureName, measureNoun } from "./goalSentence.ts";

test("money sources read as 'of X'", () => {
  assert.equal(
    composeObjective({ target: 200000, source: "revenue_won", formattedTarget: "₹200,000" }),
    "Reach ₹200,000 of revenue won"
  );
});

test("count sources read without 'of'", () => {
  // "Reach 8 of new clients" is wrong English; the money form is the exception.
  assert.equal(
    composeObjective({ target: 8, source: "new_clients", formattedTarget: "8" }),
    "Reach 8 new clients"
  );
});

test("a manual measure uses its unit as the noun", () => {
  assert.equal(
    composeObjective({ target: 5, source: "manual", unit: "Sessions", formattedTarget: "5" }),
    "Reach 5 sessions"
  );
});

test("a manual measure with no unit degrades rather than inventing a noun", () => {
  // The honest gap: nothing here knows what 5 of anything means.
  assert.equal(composeObjective({ target: 5, source: "manual", formattedTarget: "5" }), "Reach 5");
  assert.equal(composeObjective({ target: 5, source: "manual", unit: "   " }), "Reach 5");
  assert.equal(composeObjective({ target: 5, source: "manual", unit: null }), "Reach 5");
});

test("falls back to the raw target when nothing formatted it", () => {
  assert.equal(composeObjective({ target: 42, source: "manual", unit: "tasks" }), "Reach 42 tasks");
});

test("measureNoun lowercases and drops the dropdown's parenthetical", () => {
  // The label is "Revenue won (deals)" — right for a select, an unwanted
  // aside mid-sentence.
  assert.equal(measureNoun("revenue_won"), "revenue won");
  assert.equal(measureNoun("new_clients"), "new clients");
  assert.equal(measureNoun("tasks_done"), "tasks completed");
  assert.equal(measureNoun("manual", "Sessions"), "sessions");
  assert.equal(measureNoun("manual", ""), "");
});

test("defaultMeasureName never returns an empty string", () => {
  // It ends up in a row label, and an empty label reads as a rendering bug.
  assert.equal(defaultMeasureName({ target: 1, source: "manual" }), "Progress");
  assert.equal(defaultMeasureName({ target: 1, source: "manual", unit: "sessions" }), "sessions");
});
