/*
  Relative, with an explicit `.ts` on the runtime imports. The `@/` alias is a
  tsconfig path the bundler resolves and Node's type-stripping test runner does
  not — a file importing `@/lib/types` builds fine and fails the whole suite
  with an unhelpful "test failed". Type-only imports drop the extension because
  they're erased before Node ever sees them. Same trap CLAUDE.md records
  against invoiceStage.ts.
*/
import { KEY_RESULT_SOURCE_LABELS } from "./types.ts";
import type { KeyResultSource } from "./types";
import { isMoneySource } from "./goals.ts";

/**
 * A goal's name, written from what it measures.
 *
 * ── Why the objective stops being a free-text field ─────────────────────────
 *
 * The old form asked for an objective, then asked separately for a key result
 * with its own name. Two name fields for one idea, and in production they
 * diverged exactly as you'd expect:
 *
 *   objective "Earn 1 Lakhs"          key result "10000"   target 200,000
 *
 * Three numbers, none of which agree. The objective says one lakh, the
 * measure is named ten thousand, and the actual target is two lakh. Nobody
 * chose that; it's what happens when a form asks the same question twice and
 * neither answer is checked against the other.
 *
 * So the sentence is composed from the parts that are already true — the
 * target, the thing being counted, the unit. It can't disagree with the
 * measure because it's derived from it.
 *
 * ── The override ────────────────────────────────────────────────────────────
 *
 * `objective` stays a real column and a person can still write their own.
 * "Reach ₹200,000 of revenue won" is accurate but flat, and a team that wants
 * to call it "Break one lakh" should be able to. The difference from before is
 * that the default is generated and correct, so an empty or lazily-filled
 * field can't produce nonsense.
 */

export interface MeasureParts {
  target: number;
  source: KeyResultSource;
  unit?: string | null;
  /** Pre-formatted by the caller — this module doesn't know the currency. */
  formattedTarget?: string;
}

/**
 * Lower-case fragment naming what's being counted.
 *
 * The parenthetical is stripped. `KEY_RESULT_SOURCE_LABELS` is written for a
 * dropdown, where "Revenue won (deals)" usefully disambiguates which revenue
 * is meant. Inside a sentence it reads as an aside nobody asked for — "Reach
 * ₹200,000 of revenue won (deals)". Stripping it here keeps one label map
 * rather than a second one that drifts.
 */
export function measureNoun(source: KeyResultSource, unit?: string | null): string {
  if (source === "manual") {
    const u = (unit ?? "").trim();
    return u ? u.toLowerCase() : "";
  }
  return KEY_RESULT_SOURCE_LABELS[source]
    .replace(/\s*\([^)]*\)/g, "")
    .trim()
    .toLowerCase();
}

/**
 * "Reach ₹200,000 of revenue won" / "Reach 8 new clients" / "Reach 5 sessions"
 *
 * A manual measure with no unit has nothing to name, so it degrades to
 * "Reach 5" rather than inventing a noun — an honest gap the person can fill
 * by typing a unit or their own objective.
 */
export function composeObjective(parts: MeasureParts): string {
  const amount = parts.formattedTarget ?? String(parts.target);
  const noun = measureNoun(parts.source, parts.unit);
  if (!noun) return `Reach ${amount}`;
  // Money reads as "₹200,000 of revenue won"; counts read as "8 new clients".
  // "8 of new clients" is wrong, and "₹200,000 new clients" is worse.
  return isMoneySource(parts.source)
    ? `Reach ${amount} of ${noun}`
    : `Reach ${amount} ${noun}`;
}

/**
 * The measure's own name, for the row under the goal.
 *
 * Deliberately not the objective repeated. When a goal has one measure the
 * row already carries the sentence, so naming it again is the duplication
 * this module exists to remove — the caller shows the numbers instead.
 */
export function defaultMeasureName(parts: MeasureParts): string {
  const noun = measureNoun(parts.source, parts.unit);
  return noun || "Progress";
}
