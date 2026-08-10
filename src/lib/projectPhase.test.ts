import test from "node:test";
import assert from "node:assert/strict";
import {
  currentPhaseIndex,
  dayKey,
  isDelivered,
  parseDay,
  phaseProgress,
  pausedProgress,
  phaseStepsFor,
  spanCoversDay,
  statusChangePatch,
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

test("a KNOWN pause marks the phase it stopped in, with no extra terminal", () => {
  // Appending a terminal AND keeping four phases renders everything before the
  // terminal as done — which claims a project paused during Planning got all
  // the way through Review. The phase itself carries it instead.
  const steps = phaseStepsFor("On Hold", "Planning");
  assert.equal(steps.length, 4, "no appended fifth step when we know where");
  assert.equal(steps[0].tone, "negative", "Planning is where it stopped");
  assert.equal(currentPhaseIndex("On Hold", "Planning"), 0);

  // And the phases after it are NOT marked done.
  assert.equal(steps[1].tone, "neutral");
  assert.equal(steps[2].tone, "neutral");
});

test("an UNKNOWN pause still renders the honest 'we don't know' shape", () => {
  // Projects paused before migration 2026-08-10a have null. Nothing was
  // backfilled, so this path has to keep working exactly as it did.
  const steps = phaseStepsFor("On Hold", null);
  assert.equal(steps.length, 5);
  assert.equal(steps[4].label, "On Hold");
  assert.equal(currentPhaseIndex("On Hold", null), 4);
  // Same for undefined — a caller that hasn't been updated yet.
  assert.equal(phaseStepsFor("On Hold").length, 5);
});

test("a paused_from the database would reject is ignored, not rendered", () => {
  // The DB constrains this to Planning/In Progress/Review, but the column is
  // plain text and this code renders data it doesn't own.
  const steps = phaseStepsFor("On Hold", "Delivered");
  assert.equal(steps.length, 5, "falls back to the unknown shape");
  assert.equal(currentPhaseIndex("On Hold", "Delivered"), 4);
});

test("pausedProgress answers 'how far did it get', not 'how close is it'", () => {
  // Deliberately different from phaseProgress, which returns 0 for a paused
  // project because it feeds the heat scale. Conflating the two would paint a
  // project that reached Review as though it had never started.
  assert.equal(phaseProgress("On Hold"), 0, "heat: not close to done");
  assert.equal(pausedProgress("On Hold", "Review"), 0.75, "history: got to Review");

  // Null where there's nothing to say — the caller shows nothing rather than a
  // zero that reads as progress.
  assert.equal(pausedProgress("On Hold", null), null);
  assert.equal(pausedProgress("In Progress", "Planning"), null, "not paused");
  assert.equal(pausedProgress("On Hold", "Delivered"), null, "not a pausable phase");
});

test("pausing remembers the phase it paused from", () => {
  assert.deepEqual(statusChangePatch("Review", "On Hold"), {
    status: "On Hold",
    paused_from: "Review",
  });
  assert.deepEqual(statusChangePatch("Planning", "On Hold"), {
    status: "On Hold",
    paused_from: "Planning",
  });
});

test("RESUMING clears paused_from — the constraint rejects the update otherwise", () => {
  // `status = 'On Hold' or paused_from is null`. Leaving a stale value behind
  // doesn't just look wrong, Postgres refuses the whole update — so resuming a
  // project would silently do nothing at all.
  assert.deepEqual(statusChangePatch("On Hold", "In Progress"), {
    status: "In Progress",
    paused_from: null,
  });
  assert.deepEqual(statusChangePatch("On Hold", "Delivered"), {
    status: "Delivered",
    paused_from: null,
  });
});

test("pausing from a non-pausable state records nothing rather than a lie", () => {
  // Delivered isn't pausable (the DB says so too), and pausing an already-held
  // project has no new phase to record.
  assert.deepEqual(statusChangePatch("Delivered", "On Hold"), {
    status: "On Hold",
    paused_from: null,
  });
  assert.deepEqual(statusChangePatch("On Hold", "On Hold"), {
    status: "On Hold",
    paused_from: null,
  });
});

test("every status pair produces a patch the DB constraints accept", () => {
  // Mirrors projects_paused_from_valid and projects_paused_from_only_when_held.
  for (const from of PROJECT_STATUSES) {
    for (const to of PROJECT_STATUSES) {
      const p = statusChangePatch(from, to);
      if (p.paused_from !== null) {
        assert.equal(p.status, "On Hold", `${from}→${to}: value set while not held`);
        assert.ok(
          (["Planning", "In Progress", "Review"] as ProjectStatus[]).includes(p.paused_from),
          `${from}→${to}: ${p.paused_from} is not a pausable phase`
        );
      }
    }
  }
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
