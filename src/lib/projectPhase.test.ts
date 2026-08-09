import test from "node:test";
import assert from "node:assert/strict";
import {
  currentPhaseIndex,
  dayKey,
  isDelivered,
  parseDay,
  phaseProgress,
  phaseStepsFor,
  spanCoversDay,
  spanPosition,
  taskCompletion,
  taskSpan,
} from "./projectPhase.ts";
import { PROJECT_STATUSES } from "./types.ts";
import type { ProjectStatus, ProjectTask, TaskStatus } from "./types.ts";

/** Tests run with TZ=UTC (see the `test` script). */

test("On Hold is not a fifth phase after Delivered", () => {
  // Rendering PROJECT_STATUSES linearly claims a project moves
  // Delivered → On Hold, which is backwards. It's a suspension, not a step.
  const running = phaseStepsFor("In Progress");
  assert.equal(running.length, 4);
  assert.ok(!running.some((s) => s.id === "On Hold"));
});

test("a paused project shows a negative terminal, and none of the phases current", () => {
  const steps = phaseStepsFor("On Hold");
  assert.equal(steps.length, 5);
  assert.equal(steps[4].label, "On Hold");
  assert.equal(steps[4].tone, "negative");
  // Points at the appended slot, not at a phase we'd be guessing.
  assert.equal(currentPhaseIndex("On Hold"), 4);
});

test("Delivered is toned positive, not just 'current'", () => {
  const steps = phaseStepsFor("Delivered");
  assert.equal(steps[3].tone, "positive");
  assert.equal(currentPhaseIndex("Delivered"), 3);
  assert.equal(isDelivered("Delivered"), true);
  assert.equal(isDelivered("Review"), false);
});

test("every status in PROJECT_STATUSES produces a valid stepper", () => {
  // Guards a migration adding a status this file doesn't know: the index must
  // land inside the array, or every step renders locked and the project looks
  // like it never started.
  for (const status of PROJECT_STATUSES) {
    const steps = phaseStepsFor(status);
    const i = currentPhaseIndex(status);
    assert.ok(i >= 0 && i < steps.length, `${status} gave index ${i} of ${steps.length}`);
  }
});

test("a paused project has ZERO progress, not the progress it had", () => {
  // This feeds the heat scale. The question is "how close is this to done",
  // and a stalled project is not close to done however far it got.
  assert.equal(phaseProgress("On Hold"), 0);
  assert.equal(phaseProgress("Delivered"), 1);
});

test("progress rises monotonically through the phases", () => {
  let prev = -1;
  for (const p of ["Planning", "In Progress", "Review", "Delivered"] as ProjectStatus[]) {
    const v = phaseProgress(p);
    assert.ok(v > prev, `${p} (${v}) should exceed ${prev}`);
    prev = v;
  }
});

test("an unrecognised status scores zero rather than throwing", () => {
  assert.equal(phaseProgress("Nonsense" as ProjectStatus), 0);
  assert.doesNotThrow(() => phaseStepsFor("Nonsense" as ProjectStatus));
});

/* ── task completion ── */

const t = (status: TaskStatus): Pick<ProjectTask, "status"> => ({ status });

test("archiving a task must not make a project look less complete", () => {
  // The tempting bug: count archived in the denominator. Archive one of two
  // done tasks and completion drops from 100% to 50%, which is the opposite
  // of what archiving means.
  const before = taskCompletion([t("Done"), t("Done")]);
  const after = taskCompletion([t("Done"), t("Done"), t("Archived")]);
  assert.equal(before.fraction, 1);
  assert.equal(after.fraction, 1);
  assert.equal(after.total, 2, "archived must not be counted");
});

test("taskCompletion survives an empty project", () => {
  // 0/0 is NaN, which renders as "NaN%" and sizes a bar to nothing.
  const r = taskCompletion([]);
  assert.equal(r.fraction, 0);
  assert.equal(r.total, 0);
  assert.ok(Number.isFinite(r.fraction));
});

test("taskCompletion counts only Done as done", () => {
  const r = taskCompletion([t("Done"), t("In Progress"), t("Not Started")]);
  assert.equal(r.done, 1);
  assert.equal(r.total, 3);
});

/* ── multi-day spans ── */

test("parseDay builds a LOCAL date, so spans don't shift a day west of UTC", () => {
  // `new Date("2026-08-10")` is UTC midnight — the 9th in New York. A span
  // drawn one day out reads as a rendering glitch rather than as bad data.
  const d = parseDay("2026-08-10")!;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 10);
  assert.equal(dayKey(d), "2026-08-10");
});

test("parseDay rejects rubbish rather than producing an Invalid Date", () => {
  assert.equal(parseDay("not a date"), null);
  assert.equal(parseDay(""), null);
});

test("a span is INCLUSIVE of both ends", () => {
  // 3rd to 5th is three days. Off-by-one draws the block a day short.
  const s = taskSpan({ start_date: "2026-08-03", due_date: "2026-08-05" })!;
  assert.equal(s.days, 3);
  assert.equal(s.start, "2026-08-03");
  assert.equal(s.end, "2026-08-05");
});

test("a single-day task is 1 day, not 0", () => {
  assert.equal(taskSpan({ start_date: "2026-08-03", due_date: "2026-08-03" })!.days, 1);
});

test("every real shape of row produces something drawable", () => {
  // due only — every task created before migration 2026-08-08b
  const dueOnly = taskSpan({ start_date: null, due_date: "2026-08-07" })!;
  assert.deepEqual([dueOnly.start, dueOnly.end, dueOnly.days], ["2026-08-07", "2026-08-07", 1]);

  // start only — open-ended work, which the DB allows
  const startOnly = taskSpan({ start_date: "2026-08-07", due_date: null })!;
  assert.deepEqual([startOnly.start, startOnly.end, startOnly.days], ["2026-08-07", "2026-08-07", 1]);

  // neither — not on a calendar at all
  assert.equal(taskSpan({ start_date: null, due_date: null }), null);
});

test("a reversed range draws as one day, not a negative-width block", () => {
  // The DB constrains start <= due, but this renders data it doesn't own.
  const s = taskSpan({ start_date: "2026-08-09", due_date: "2026-08-03" })!;
  assert.equal(s.days, 1);
  assert.equal(s.start, "2026-08-09");
});

test("a span crossing a month boundary counts correctly", () => {
  const s = taskSpan({ start_date: "2026-07-30", due_date: "2026-08-02" })!;
  assert.equal(s.days, 4);
});

test("a span crossing a DST boundary is still whole days", () => {
  // Rounding, not flooring, in the day maths: a 23- or 25-hour day would
  // otherwise drop or add one.
  const s = taskSpan({ start_date: "2026-03-27", due_date: "2026-03-31" })!;
  assert.equal(s.days, 5);
});

test("spanCoversDay includes both endpoints", () => {
  const s = taskSpan({ start_date: "2026-08-03", due_date: "2026-08-05" });
  assert.equal(spanCoversDay(s, "2026-08-02"), false);
  assert.equal(spanCoversDay(s, "2026-08-03"), true);
  assert.equal(spanCoversDay(s, "2026-08-04"), true);
  assert.equal(spanCoversDay(s, "2026-08-05"), true);
  assert.equal(spanCoversDay(s, "2026-08-06"), false);
  assert.equal(spanCoversDay(null, "2026-08-04"), false);
});

test("spanPosition rounds only the outer corners", () => {
  // So a multi-day block reads as one bar rather than as N separate chips.
  const s = taskSpan({ start_date: "2026-08-03", due_date: "2026-08-05" });
  assert.equal(spanPosition(s, "2026-08-03"), "start");
  assert.equal(spanPosition(s, "2026-08-04"), "middle");
  assert.equal(spanPosition(s, "2026-08-05"), "end");
  assert.equal(spanPosition(s, "2026-08-06"), "none");

  const one = taskSpan({ start_date: "2026-08-03", due_date: "2026-08-03" });
  assert.equal(spanPosition(one, "2026-08-03"), "single");
});
