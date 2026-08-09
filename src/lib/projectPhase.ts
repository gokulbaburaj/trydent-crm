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

export type PhaseTone = "neutral" | "positive" | "negative";

export interface PhaseStep {
  id: ProjectStatus;
  label: string;
  tone: PhaseTone;
}

/**
 * Steps to render for a project in a given status.
 *
 * ── A limitation worth naming ───────────────────────────────────────────────
 *
 * When a project is On Hold we cannot say WHICH phase it paused in, because
 * the schema doesn't store it — `status` is a single column and "On Hold"
 * overwrote whatever was there. So the stepper shows the four phases with none
 * marked current, plus a paused terminal.
 *
 * The honest alternative is a `paused_from` column and a migration. That's a
 * real fix and this is not it; this is the correct rendering of the data that
 * exists. Don't infer a phase from `updated_at` — it would be a guess wearing
 * the costume of a fact.
 */
export function phaseStepsFor(status: ProjectStatus): PhaseStep[] {
  const phases: PhaseStep[] = PHASE_ORDER.map((p) => ({
    id: p,
    label: p,
    tone: p === "Delivered" ? ("positive" as const) : ("neutral" as const),
  }));

  if (status === ON_HOLD) {
    return [...phases, { id: ON_HOLD, label: "On Hold", tone: "negative" }];
  }
  return phases;
}

/**
 * Index of the current step within `phaseStepsFor(status)`.
 *
 * Returns the appended On Hold slot for a paused project, and -1 for a status
 * this file doesn't recognise — which the stepper renders as "nothing reached
 * yet" rather than throwing.
 */
export function currentPhaseIndex(status: ProjectStatus): number {
  if (status === ON_HOLD) return PHASE_ORDER.length;
  return PHASE_ORDER.indexOf(status);
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
