import type { DealStage } from "./types";

/**
 * Deal stages as a stepper.
 *
 * ── Why this isn't just DEAL_STAGES ─────────────────────────────────────────
 *
 * DEAL_STAGES is `[Lead, Qualified, Proposal, Closed Won, Closed Lost]`, which
 * is the right list and the wrong shape for a progress indicator. Rendered
 * linearly it claims Closed Lost comes AFTER Closed Won — that losing a deal is
 * the step following winning it. It also means a won deal shows one stage still
 * ahead of it, so the most successful outcome in the system renders as
 * incomplete.
 *
 * The two closed states are alternative OUTCOMES of one final step, not two
 * steps. So the pipeline is three stages and a terminal that resolves to
 * whichever way the deal actually went — the same shape as the reference's
 * Qualify → Develop → Propose → Close.
 */

/** The stages a deal genuinely passes through, in order. */
export const OPEN_STAGES: DealStage[] = ["Lead", "Qualified", "Proposal"];

export const CLOSED_WON: DealStage = "Closed Won";
export const CLOSED_LOST: DealStage = "Closed Lost";

export type StageTone = "neutral" | "positive" | "negative";

export interface DealStep {
  id: DealStage;
  label: string;
  tone: StageTone;
}

/**
 * The steps to render for a deal in a given stage.
 *
 * An open deal shows "Close" as its unreached terminal — no promise about
 * which way it will go. A closed deal shows the outcome it reached, toned so
 * that a loss reads as a loss rather than as a completed step in primary.
 */
export function stepsFor(stage: DealStage): DealStep[] {
  const open: DealStep[] = OPEN_STAGES.map((s) => ({
    id: s,
    label: s,
    tone: "neutral" as const,
  }));

  if (stage === CLOSED_LOST) {
    return [...open, { id: CLOSED_LOST, label: "Lost", tone: "negative" }];
  }
  if (stage === CLOSED_WON) {
    return [...open, { id: CLOSED_WON, label: "Won", tone: "positive" }];
  }
  /*
    Still open. The terminal's label depends on whether it's REACHABLE.

    From Lead or Qualified it's a distant step, and labelling it "Won" there
    reads as a forecast the app has no business making — so it's "Close", the
    name of the phase.

    From Proposal it's the next click, and a button that says "Close" while
    setting the stage to Closed Won is lying about what it does. So it says
    "Win". Losing a deal is a different decision and is made from the stage
    picker or the board, not by advancing a progress bar.
  */
  const reachable = stage === OPEN_STAGES[OPEN_STAGES.length - 1];
  return [
    ...open,
    { id: CLOSED_WON, label: reachable ? "Win" : "Close", tone: "neutral" },
  ];
}

/**
 * Which step index a deal is currently on.
 *
 * Both closed states map to the terminal index, which is what makes the
 * stepper show a lost deal as finished rather than as stalled at Proposal.
 */
export function currentStepIndex(stage: DealStage): number {
  const i = OPEN_STAGES.indexOf(stage);
  if (i !== -1) return i;
  return OPEN_STAGES.length; // both Closed Won and Closed Lost
}

/** A deal that has reached an outcome. No further stage changes are forward. */
export function isClosed(stage: DealStage): boolean {
  return stage === CLOSED_WON || stage === CLOSED_LOST;
}

/**
 * Progress through the pipeline, 0..1 — used for the heat scale and summaries.
 *
 * A LOST deal returns 0, not 1. It reached the end of the process, but the
 * question this answers is "how close is this to money", and the answer for a
 * lost deal is "no closer than never having started". Returning 1 would paint
 * every dead deal as hot, which is precisely backwards.
 */
export function pipelineProgress(stage: DealStage): number {
  if (stage === CLOSED_LOST) return 0;
  if (stage === CLOSED_WON) return 1;
  const i = OPEN_STAGES.indexOf(stage);
  if (i === -1) return 0;
  // +1 so Lead isn't zero — a lead in the system is further along than nothing.
  return (i + 1) / (OPEN_STAGES.length + 1);
}

/**
 * How much of a deal has actually been collected, 0..1.
 *
 * Guards a zero deal_value, which is real data — deals get created before
 * anyone has agreed a number, and `paid / 0` is Infinity or NaN, both of which
 * render as a progress bar of impossible width.
 */
export function collectedFraction(paid: number, value: number): number {
  if (!Number.isFinite(paid) || !Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(1, paid / value));
}
