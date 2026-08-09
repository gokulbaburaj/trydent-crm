import test from "node:test";
import assert from "node:assert/strict";
import {
  collectedFraction,
  currentStepIndex,
  isClosed,
  pipelineProgress,
  stepsFor,
} from "./dealStages.ts";
import { DEAL_STAGES } from "./types.ts";
import type { DealStage } from "./types.ts";

test("a won deal shows four steps with no stage left ahead of it", () => {
  // The linear-list bug: rendering DEAL_STAGES straight leaves "Closed Lost"
  // sitting after "Closed Won", so the best outcome in the system displays as
  // incomplete with losing as the next step.
  const steps = stepsFor("Closed Won");
  assert.equal(steps.length, 4);
  assert.equal(steps[3].label, "Won");
  assert.equal(steps[3].tone, "positive");
  assert.equal(currentStepIndex("Closed Won"), 3, "won is the LAST step");
});

test("a lost deal is finished, and toned as a loss", () => {
  const steps = stepsFor("Closed Lost");
  assert.equal(steps.length, 4);
  assert.equal(steps[3].label, "Lost");
  assert.equal(steps[3].tone, "negative");
  // Not stalled at Proposal — it reached the end, it just went the other way.
  assert.equal(currentStepIndex("Closed Lost"), 3);
});

test("a distant terminal says Close, not Won", () => {
  // Showing "Won" as a far-off step on a live deal reads as a forecast the app
  // is in no position to make.
  for (const stage of ["Lead", "Qualified"] as DealStage[]) {
    const steps = stepsFor(stage);
    assert.equal(steps[3].label, "Close", `${stage} should not promise a win`);
    assert.equal(steps[3].tone, "neutral");
  }
});

test("a reachable terminal says Win, because that is what clicking it does", () => {
  // At Proposal the terminal is one click away and it sets Closed Won. A
  // button labelled "Close" that wins the deal is lying about its own effect.
  const steps = stepsFor("Proposal");
  assert.equal(steps[3].label, "Win");
  assert.equal(steps[3].id, "Closed Won");
});

test("open stages map to their own index", () => {
  assert.equal(currentStepIndex("Lead"), 0);
  assert.equal(currentStepIndex("Qualified"), 1);
  assert.equal(currentStepIndex("Proposal"), 2);
});

test("every stage in DEAL_STAGES produces a valid stepper", () => {
  // Guards against a migration adding a stage that this file doesn't know:
  // the index must always land inside the steps array, or the stepper renders
  // every step as locked and the deal looks like it hasn't started.
  for (const stage of DEAL_STAGES) {
    const steps = stepsFor(stage);
    const i = currentStepIndex(stage);
    assert.ok(i >= 0 && i < steps.length, `${stage} produced index ${i} of ${steps.length}`);
  }
});

test("isClosed covers both outcomes and nothing else", () => {
  assert.equal(isClosed("Closed Won"), true);
  assert.equal(isClosed("Closed Lost"), true);
  assert.equal(isClosed("Lead"), false);
  assert.equal(isClosed("Qualified"), false);
  assert.equal(isClosed("Proposal"), false);
});

test("a LOST deal has zero progress, not full progress", () => {
  // The tempting bug: "it reached the end, so it's 1". This value feeds the
  // heat scale, and a lost deal painted hot is exactly backwards — the
  // question is how close this is to money.
  assert.equal(pipelineProgress("Closed Lost"), 0);
  assert.equal(pipelineProgress("Closed Won"), 1);
});

test("progress increases monotonically through the open stages", () => {
  const open: DealStage[] = ["Lead", "Qualified", "Proposal"];
  let prev = -1;
  for (const stage of open) {
    const p = pipelineProgress(stage);
    assert.ok(p > prev, `${stage} (${p}) should exceed the previous stage (${prev})`);
    assert.ok(p > 0 && p < 1, `${stage} should be strictly between 0 and 1, got ${p}`);
    prev = p;
  }
});

test("an unrecognised stage scores zero rather than throwing", () => {
  assert.equal(pipelineProgress("Nonsense" as DealStage), 0);
  assert.doesNotThrow(() => stepsFor("Nonsense" as DealStage));
});

test("collectedFraction survives a zero-value deal", () => {
  // Real data: deals are created before anyone agrees a number. paid/0 is
  // Infinity or NaN, and both render as a bar of impossible width.
  assert.equal(collectedFraction(0, 0), 0);
  assert.equal(collectedFraction(500, 0), 0);
  assert.equal(collectedFraction(500, NaN), 0);
  assert.equal(collectedFraction(NaN, 500), 0);
});

test("collectedFraction clamps overpayment and refunds", () => {
  assert.equal(collectedFraction(250, 1000), 0.25);
  assert.equal(collectedFraction(1000, 1000), 1);
  // Paid more than the deal is worth — a real thing, and not 120% of a bar.
  assert.equal(collectedFraction(1200, 1000), 1);
  assert.equal(collectedFraction(-50, 1000), 0);
});
