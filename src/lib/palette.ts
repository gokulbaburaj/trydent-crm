/**
 * Categorical hues — the colours used to tell things APART.
 *
 * ── Why these are hex and not CSS tokens ────────────────────────────────────
 *
 * An audit flagged the hex literals in this app as `color-semantic`
 * violations. For most of them that's wrong, and the distinction is worth
 * writing down so it isn't re-litigated.
 *
 * Semantic tokens answer "what does this colour MEAN" — surface, danger,
 * muted. There is exactly one right answer per token, and a component
 * hardcoding `#fff` where `--surface` belongs is a real bug.
 *
 * These answer "how do I tell six adjacent things apart". There is no
 * semantic content: event #3 is amber because #2 was indigo, not because
 * amber means anything. `--primary` can't supply six mutually distinguishable
 * hues, and both consumers do string arithmetic on the value —
 * `color-mix(in oklab, ${hue} 16%, transparent)` — which needs a real colour,
 * not a var that resolves at paint time.
 *
 * ── Why one list and not two ────────────────────────────────────────────────
 *
 * There were two: EVENT_HUES in the schedule page and TIMELINE_COLORS in the
 * project detail page. They shared four of six values and disagreed on the
 * other two (#7e87e2 vs #6c74dd — both indigo, four hex digits apart; #eb5757
 * vs #a855f7 — not remotely the same). Both hash a stable key into an index,
 * so a project that came out indigo on its timeline came out a slightly
 * different indigo on the calendar, for no reason anyone could have stated.
 *
 * Divergence like that is what a shared constant prevents. Adding a hue here
 * now shifts every consumer's modulus together instead of one of them.
 */
export const CATEGORICAL_HUES = [
  "#4ea7e0", // blue
  "#7e87e2", // indigo
  "#d9a53f", // amber
  "#d95c8a", // pink
  "#4cb782", // green
  "#eb5757", // red
] as const;

/**
 * Pick a hue for a key, stably.
 *
 * Same key always yields the same colour, across reloads and across views —
 * that's the whole point, and it's why this is a hash rather than an index
 * into a sorted list (which would recolour everything the moment a row is
 * inserted).
 *
 * djb2-ish. `| 0` keeps it in int32 so long keys don't drift into float
 * territory and start colliding.
 */
export function hueFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CATEGORICAL_HUES[Math.abs(hash) % CATEGORICAL_HUES.length];
}
