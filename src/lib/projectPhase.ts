import type { ProjectStatus, ProjectTask, TaskStatus } from "./types";

/**
 * Project phases, task completion, and multi-day task spans.
 *
 * Pure date and counting logic, lifted out of the view before it was written
 * rather than after — this project's rule is that pure logic gets a test, and
 * the deal-stage equivalent proved the rule earns its keep (it caught a
 * ranking bug that would have painted every churned account as healthy).
 */

/**
 * The phases a project genuinely passes through, in order.
 *
 * PROJECT_STATUSES also contains "On Hold", which is NOT a phase — it's a
 * suspension that can happen from any of these and returns to any of these.
 * Rendering it as a fifth step would claim a project moves Delivered → On Hold,
 * which is backwards.
 */
export const PHASE_ORDER: ProjectStatus[] = [
  "Planning",
  "In Progress",
  "Review",
  "Delivered",
];

export const ON_HOLD: ProjectStatus = "On Hold";

/**
 * Phases a project can be paused FROM.
 *
 * Not the same list as PHASE_ORDER, which includes Delivered — pausing a
 * shipped project is meaningless, and the database says so too
 * (`projects_paused_from_valid` in migration 2026-08-10a).
 *
 * Kept separate rather than derived with a `.slice(0, -1)`, because the reason
 * Delivered is excluded is semantic, not positional: it isn't "the last one",
 * it's "the one you can't stall in". A slice would silently start excluding
 * Review the day a fifth phase is added.
 */
export const PAUSABLE_PHASES: ProjectStatus[] = ["Planning", "In Progress", "Review"];

export type PhaseTone = "neutral" | "positive" | "negative";

export interface PhaseStep {
  id: ProjectStatus;
  label: string;
  tone: PhaseTone;
}

/**
 * Steps to render for a project in a given status.
 *
 * ── The limitation this used to have ────────────────────────────────────────
 *
 * `status` is a single column, so pausing a project overwrote the phase it was
 * in. The stepper could only say "paused" and not "paused during Review" —
 * documented as a known gap rather than guessed at, because inferring it from
 * `updated_at` would be a guess wearing the costume of a fact.
 *
 * Migration 2026-08-10a added `paused_from`, so that's now answerable. Passing
 * it marks the phase the project stalled in as still-current beneath the
 * paused terminal, which is the difference between "this stopped" and "this
 * stopped HERE".
 *
 * Still optional. Projects paused before the migration have null, and null
 * renders exactly as it did before — no phase marked. Nothing was backfilled
 * because nobody knows where those stopped.
 */
export function phaseStepsFor(
  status: ProjectStatus,
  pausedFrom?: ProjectStatus | null
): PhaseStep[] {
  const phases: PhaseStep[] = PHASE_ORDER.map((p) => ({
    id: p,
    label: p,
    tone: p === "Delivered" ? ("positive" as const) : ("neutral" as const),
  }));

  if (status !== ON_HOLD) return phases;

  /*
    Paused, and we know where.

    No appended terminal in this case. A project on hold IS at a phase — the
    one it stopped in — so that phase is marked negative and the ones before it
    read as done. Appending a fifth step as well would render every phase
    before the terminal as complete, which claims a project paused during
    Planning got all the way through Review.

    The "On Hold" wording isn't lost: the status badge beside the stepper
    already says it. The stepper's job here is WHERE, not WHETHER.
  */
  if (pausedFrom && PAUSABLE_PHASES.includes(pausedFrom)) {
    return phases.map((p) =>
      p.id === pausedFrom ? { ...p, tone: "negative" as const } : p
    );
  }

  // Paused before the column existed. Unchanged from before: a terminal with
  // no phase marked, which is the honest rendering of "we don't know".
  return [...phases, { id: ON_HOLD, label: "On Hold", tone: "negative" }];
}

/**
 * How far a paused project had got, 0..1, or null when unknowable.
 *
 * Separate from `phaseProgress`, which deliberately returns 0 for a paused
 * project because it feeds the heat scale and a stalled project is not close
 * to done. This answers a different question — "how far had it got" rather
 * than "how close is it" — and the two must not be conflated.
 *
 * Null for a project that isn't paused, and for one paused before the column
 * existed. The caller shows nothing rather than a zero that reads as progress.
 */
export function pausedProgress(
  status: ProjectStatus,
  pausedFrom: ProjectStatus | null | undefined
): number | null {
  if (status !== ON_HOLD || !pausedFrom) return null;
  if (!PAUSABLE_PHASES.includes(pausedFrom)) return null;
  const i = PHASE_ORDER.indexOf(pausedFrom);
  if (i === -1) return null;
  return (i + 1) / PHASE_ORDER.length;
}

/**
 * Index of the current step within `phaseStepsFor(status)`.
 *
 * Returns the appended On Hold slot for a paused project, and -1 for a status
 * this file doesn't recognise — which the stepper renders as "nothing reached
 * yet" rather than throwing.
 */
export function currentPhaseIndex(
  status: ProjectStatus,
  pausedFrom?: ProjectStatus | null
): number {
  if (status === ON_HOLD) {
    // Known pause: the project sits AT that phase, so the index points there
    // rather than at an appended terminal that phaseStepsFor no longer emits.
    if (pausedFrom && PAUSABLE_PHASES.includes(pausedFrom)) {
      const i = PHASE_ORDER.indexOf(pausedFrom);
      if (i !== -1) return i;
    }
    return PHASE_ORDER.length;
  }
  return PHASE_ORDER.indexOf(status);
}

/**
 * The patch to write when a project's status changes.
 *
 * `paused_from` can't be set independently of `status` — the database enforces
 * `status = 'On Hold' or paused_from is null`, so any update that changes one
 * has to consider the other or Postgres rejects it. Putting that in one place
 * means no call site can get it half-right.
 *
 * Three rules:
 *  - pausing from a real phase   → remember it
 *  - pausing from anywhere else  → null (Delivered isn't pausable; pausing an
 *                                 already-held project has nothing new to say)
 *  - resuming, or any other move → CLEAR it
 *
 * That last one is the one that would have bitten. Leaving a stale value
 * behind doesn't just look wrong, it violates the constraint and the whole
 * update fails — so resuming a project would silently do nothing.
 */
export function statusChangePatch(
  current: ProjectStatus,
  next: ProjectStatus
): { status: ProjectStatus; paused_from: ProjectStatus | null } {
  if (next !== ON_HOLD) return { status: next, paused_from: null };
  return {
    status: ON_HOLD,
    paused_from: PAUSABLE_PHASES.includes(current) ? current : null,
  };
}

/** A project that has shipped. */
export function isDelivered(status: ProjectStatus): boolean {
  return status === "Delivered";
}

/**
 * How far through the phases, 0..1.
 *
 * On Hold returns the progress of NOTHING — 0 — for the same reason a lost
 * deal does: this feeds the heat scale, and the question it answers is "how
 * close is this to done". A paused project is not close to done, however far
 * it got before it stopped.
 */
export function phaseProgress(status: ProjectStatus): number {
  if (status === ON_HOLD) return 0;
  const i = PHASE_ORDER.indexOf(status);
  if (i === -1) return 0;
  return (i + 1) / PHASE_ORDER.length;
}

/**
 * Task completion for a project, ignoring archived tasks.
 *
 * Archived is not "not done" — it's "no longer counted". Including archived
 * tasks in the denominator means archiving a task makes a project look LESS
 * complete, which is the opposite of what archiving means.
 */
export function taskCompletion(tasks: Pick<ProjectTask, "status">[]): {
  done: number;
  total: number;
  fraction: number;
} {
  const counted = tasks.filter((t) => t.status !== ("Archived" as TaskStatus));
  const done = counted.filter((t) => t.status === ("Done" as TaskStatus)).length;
  const total = counted.length;
  // 0/0 is NaN, which renders as "NaN%" and sizes a progress bar to nothing.
  return { done, total, fraction: total === 0 ? 0 : done / total };
}

/* ─────────────────────── Multi-day task spans ─────────────────────── */

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" for a Date, in LOCAL time. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Parse a "YYYY-MM-DD" as a LOCAL date, not UTC.
 *
 * `new Date("2026-08-10")` is UTC midnight, which is the 9th for anyone west
 * of Greenwich — the exact bug documented against `formatDate` in
 * format.test.ts. A task span drawn one day out is invisible in London and
 * wrong in New York, so this builds from parts.
 */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface TaskSpan {
  /** First day the task occupies. */
  start: string;
  /** Last day, inclusive. */
  end: string;
  /** Inclusive day count — a single-day task is 1, not 0. */
  days: number;
}

/**
 * The days a task occupies.
 *
 * `start_date` has been stored and editable since migration 2026-08-08b and
 * has never been drawn anywhere. This is the piece that makes it visible.
 *
 * Rules, each of which is a real row in the database:
 *  - both dates → the inclusive range between them
 *  - due only   → a single day (every task created before the migration)
 *  - start only → a single day, the start (open-ended work; the DB allows it)
 *  - neither    → null, the task isn't on a calendar at all
 *
 * Inclusive on both ends: a task from the 3rd to the 5th occupies three days,
 * not two. Off-by-one here draws the block a day short, which reads as a
 * rendering glitch rather than as wrong data.
 */
export function taskSpan(
  task: Pick<ProjectTask, "start_date" | "due_date">
): TaskSpan | null {
  const s = task.start_date ? parseDay(task.start_date) : null;
  const e = task.due_date ? parseDay(task.due_date) : null;

  if (!s && !e) return null;
  if (s && !e) return { start: dayKey(s), end: dayKey(s), days: 1 };
  if (!s && e) return { start: dayKey(e), end: dayKey(e), days: 1 };

  // Both present. The database constrains start <= due, but this renders data
  // it doesn't own — a bad row must draw as a single day rather than a
  // negative-width block or an infinite loop.
  const start = s!;
  const end = e!;
  if (end.getTime() < start.getTime()) {
    return { start: dayKey(start), end: dayKey(start), days: 1 };
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  return { start: dayKey(start), end: dayKey(end), days };
}

/** Does a task's span cover this day? */
export function spanCoversDay(span: TaskSpan | null, key: string): boolean {
  if (!span) return false;
  return key >= span.start && key <= span.end;
}

/**
 * Where a day sits within a span — used to round only the outer corners so a
 * multi-day block reads as one bar rather than as N separate chips.
 */
export function spanPosition(
  span: TaskSpan | null,
  key: string
): "none" | "single" | "start" | "middle" | "end" {
  if (!spanCoversDay(span, key)) return "none";
  const s = span!;
  if (s.start === s.end) return "single";
  if (key === s.start) return "start";
  if (key === s.end) return "end";
  return "middle";
}
