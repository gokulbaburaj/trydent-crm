import test from "node:test";
import assert from "node:assert/strict";
import { VIEW_PREFERENCES, orderedViewPreferences } from "./useViewPreference.ts";

const keys = (list: { key: string }[]) => list.map((p) => p.key);
const ALL = keys([...VIEW_PREFERENCES]);

test("no saved order leaves the declared order alone", () => {
  assert.deepEqual(keys(orderedViewPreferences([])), ALL);
});

test("a saved order is applied", () => {
  const reversed = [...ALL].reverse();
  assert.deepEqual(keys(orderedViewPreferences(reversed)), reversed);
});

test("a preference added since the order was saved lands at the end", () => {
  // The real failure mode: someone adds a row to VIEW_PREFERENCES and everyone
  // with a saved order stops seeing it.
  const partial = ALL.slice(0, 2);
  const result = keys(orderedViewPreferences(partial));
  assert.deepEqual(result.slice(0, 2), partial, "saved ones keep their order");
  assert.equal(result.length, ALL.length, "nothing is dropped");
  assert.deepEqual([...result].sort(), [...ALL].sort(), "same set, different order");
});

test("a stale key in the saved order is ignored, not rendered", () => {
  // A preference removed from VIEW_PREFERENCES leaves its key in localStorage.
  const withGhost = ["ghost-page", ...ALL];
  const result = keys(orderedViewPreferences(withGhost));
  assert.ok(!result.includes("ghost-page"), "unknown key must not produce a row");
  assert.equal(result.length, ALL.length);
});

test("a saved order that is entirely stale falls back to every row", () => {
  const result = keys(orderedViewPreferences(["nope", "also-nope"]));
  assert.deepEqual([...result].sort(), [...ALL].sort());
});

test("duplicates in the saved order do not duplicate rows", () => {
  const dupes = [ALL[0], ALL[0], ...ALL.slice(1)];
  const result = keys(orderedViewPreferences(dupes));
  assert.equal(
    new Set(result).size,
    result.length,
    "a corrupted order must not render the same preference twice"
  );
});
