import test from "node:test";
import assert from "node:assert/strict";
import { heatInRange, heatOf, washPositionOf, type HeatStep } from "./heat.ts";

test("heatOf reproduces the reference design's own scores", () => {
  // The five chips in the Dynamic 365 shot, which is where the ramp came from.
  // If these ever disagree, the thresholds moved and the design didn't.
  assert.equal(heatOf(32), 0); // rose
  assert.equal(heatOf(62), 2); // amber
  assert.equal(heatOf(72), 2); // amber
  assert.equal(heatOf(83), 3); // lime
  assert.equal(heatOf(90), 4); // ink
});

test("heatOf puts each boundary in the HIGHER step", () => {
  // Off-by-one here is silent: a score of exactly 88 rendering as lime rather
  // than ink looks like a design choice, not a bug.
  assert.equal(heatOf(39), 0);
  assert.equal(heatOf(40), 1);
  assert.equal(heatOf(59), 1);
  assert.equal(heatOf(60), 2);
  assert.equal(heatOf(74), 2);
  assert.equal(heatOf(75), 3);
  assert.equal(heatOf(87), 3);
  assert.equal(heatOf(88), 4);
});

test("heatOf clamps rather than running off the ramp", () => {
  // There is no --heat-5 and no --heat--1. An out-of-range value would
  // resolve to an empty custom property, i.e. a transparent chip.
  assert.equal(heatOf(0), 0);
  assert.equal(heatOf(100), 4);
  assert.equal(heatOf(-40), 0);
  assert.equal(heatOf(1000), 4);
});

test("heatOf treats missing and non-finite values as the bottom step", () => {
  assert.equal(heatOf(null), 0);
  assert.equal(heatOf(undefined), 0);
  assert.equal(heatOf(NaN), 0);
  assert.equal(heatOf(Infinity), 0);
});

test("heatInRange normalises against the spread actually on screen", () => {
  // Deal amounts have no natural ceiling, so the biggest one in the list is
  // the hot one whatever its absolute size.
  assert.equal(heatInRange(1000, 1000, 5000), 0);
  assert.equal(heatInRange(5000, 1000, 5000), 4);
  assert.equal(heatInRange(3000, 1000, 5000), 2);

  // Scale-invariant: the same relative position gives the same step.
  for (const factor of [1, 100, 1_000_000]) {
    assert.equal(
      heatInRange(3000 * factor, 1000 * factor, 5000 * factor),
      2,
      `midpoint should hold at factor ${factor}`
    );
  }
});

test("heatInRange collapses a degenerate range to the middle, not an extreme", () => {
  // One row, or every deal at the same amount. Returning 4 would paint the
  // whole list black and returning 0 would paint it all rose; neither is
  // information, and both look deliberate.
  assert.equal(heatInRange(500, 500, 500), 2);
  assert.equal(heatInRange(500, 900, 100), 2); // min/max the wrong way round
  assert.equal(heatInRange(500, NaN, 900), 2);
});

test("washPositionOf inverts the ramp, because hot is at the gradient's start", () => {
  // The wash runs lime → cream → peach → rose. Getting this the right way
  // round is the whole reason the function exists: a hot record's chip has to
  // match the corner of the pane it opens.
  assert.equal(washPositionOf(4), 0); // ink/lime end
  assert.equal(washPositionOf(0), 1); // rose end
  assert.equal(washPositionOf(2), 0.5);
});

test("every step maps to a token that exists", () => {
  // Guards the ramp length against someone adding a sixth step to the CSS or
  // the type without the other.
  const steps: HeatStep[] = [0, 1, 2, 3, 4];
  for (const s of steps) {
    const pos = washPositionOf(s);
    assert.ok(pos >= 0 && pos <= 1, `step ${s} fell outside the gradient`);
  }
});
