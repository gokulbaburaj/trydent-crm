import test from "node:test";
import assert from "node:assert/strict";
import { packColumns, type Placed } from "./calendarLayout.ts";

const HOUR = 60;
const at = (name: string, h: number, m = 0) => ({ item: name, startMin: h * 60 + m });
const byName = (placed: Placed<string>[], name: string) =>
  placed.find((p) => p.item === name)!;

/**
 * The invariant that actually matters: no two events that overlap in time may
 * share a column, and no block may be laid out past the right edge. Asserted
 * over whatever the function returns rather than against hardcoded columns, so
 * these keep working if the packing strategy is ever changed.
 */
function assertNoCollisions(placed: Placed<string>[], duration = HOUR) {
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const overlap =
        a.startMin < b.startMin + duration && b.startMin < a.startMin + duration;
      if (overlap) {
        assert.notEqual(
          a.col,
          b.col,
          `${a.item} and ${b.item} overlap but share column ${a.col}`
        );
      }
    }
  }
}

function assertFitsColumn(placed: Placed<string>[]) {
  for (const p of placed) {
    const width = 100 / p.cols;
    const right = p.col * width + width;
    assert.ok(p.col < p.cols, `${p.item}: col ${p.col} out of range for ${p.cols}`);
    assert.ok(right <= 100.0001, `${p.item}: right edge at ${right}% overflows`);
  }
}

test("four events at the same time split into four equal columns", () => {
  // The case from punchlist item 5, screenshot 7.
  const placed = packColumns(
    [at("A", 15, 30), at("B", 15, 30), at("C", 15, 30), at("D", 15, 30)],
    HOUR
  );
  assert.equal(placed.length, 4);
  for (const p of placed) assert.equal(p.cols, 4);
  assert.deepEqual(
    placed.map((p) => p.col).sort(),
    [0, 1, 2, 3],
    "each event should get its own column"
  );
  assertNoCollisions(placed);
  assertFitsColumn(placed);
});

test("events that do not overlap each get the full width", () => {
  const placed = packColumns([at("A", 9), at("B", 13), at("C", 17)], HOUR);
  for (const p of placed) {
    assert.equal(p.cols, 1, `${p.item} should be alone in its cluster`);
    assert.equal(p.col, 0);
  }
});

test("an event starting exactly when another ends does not overlap it", () => {
  // The boundary. 10:00 + 60m ends at 11:00, so an 11:00 event is adjacent,
  // not colliding, and should not be squeezed to half width.
  const placed = packColumns([at("A", 10), at("B", 11)], HOUR);
  assert.equal(byName(placed, "A").cols, 1);
  assert.equal(byName(placed, "B").cols, 1);
});

test("one minute of overlap is still an overlap", () => {
  const placed = packColumns([at("A", 10), at("B", 10, 59)], HOUR);
  assert.equal(byName(placed, "A").cols, 2);
  assert.equal(byName(placed, "B").cols, 2);
  assertNoCollisions(placed);
});

test("a staircase reuses columns instead of growing without bound", () => {
  // Each event starts 30 minutes after the last, so only ever two collide.
  // A naive implementation gives every event its own column and shrinks the
  // whole day to 1/n; this should stay at two.
  const placed = packColumns(
    [at("A", 15), at("B", 15, 30), at("C", 16), at("D", 16, 30), at("E", 17)],
    HOUR
  );
  for (const p of placed) assert.equal(p.cols, 2, `${p.item} should be in a 2-column cluster`);
  assertNoCollisions(placed);
  assertFitsColumn(placed);
});

test("a cluster closes once there is a real gap", () => {
  const placed = packColumns(
    [at("A", 9), at("B", 9), at("C", 9), at("D", 14)],
    HOUR
  );
  assert.equal(byName(placed, "A").cols, 3);
  assert.equal(byName(placed, "D").cols, 1, "the 14:00 event is in its own cluster");
});

test("input order does not change the layout", () => {
  const events = [at("A", 9), at("B", 9, 30), at("C", 9, 15)];
  const forward = packColumns(events, HOUR);
  const backward = packColumns([...events].reverse(), HOUR);
  const cols = (p: Placed<string>[]) =>
    p.map((x) => `${x.item}:${x.col}/${x.cols}`).sort();
  assert.deepEqual(cols(forward), cols(backward));
});

test("every event is returned exactly once", () => {
  const events = [at("A", 9), at("B", 9), at("C", 9, 30), at("D", 12), at("E", 12)];
  const placed = packColumns(events, HOUR);
  assert.equal(placed.length, events.length);
  assert.deepEqual(
    placed.map((p) => p.item).sort(),
    ["A", "B", "C", "D", "E"],
    "nothing dropped, nothing duplicated"
  );
});

test("an empty day lays out to nothing", () => {
  assert.deepEqual(packColumns([], HOUR), []);
});

test("a longer assumed duration merges clusters that an hour would separate", () => {
  // Guards the duration parameter: at 60 minutes these are two clusters, at
  // 120 they are one. If activities ever gain real end times, this is the knob.
  const events = [at("A", 9), at("B", 10, 30)];
  assert.equal(packColumns(events, 60)[0].cols, 1);
  assert.equal(packColumns(events, 120)[0].cols, 2);
});

test("midnight and end-of-day events are placed like any other", () => {
  const placed = packColumns([at("A", 0), at("B", 23, 30)], HOUR);
  assert.equal(byName(placed, "A").startMin, 0);
  assert.equal(byName(placed, "B").startMin, 23 * 60 + 30);
  assertFitsColumn(placed);
});
