/**
 * Heat scale — map a value onto one of five hue steps.
 *
 * The reference design encodes lead scores as colour: 32 rose, 62 peach,
 * 72 amber, 83 lime, 90 black. The colour IS the number, which is why a
 * queue of records is scannable without reading a single digit.
 *
 * Only ONE thing in the app is allowed to drive hue this way. If selection,
 * stage and value all colour the same chip, none of them mean anything.
 *
 * Steps are 0 (coldest) to 4 (hottest) and resolve to --heat-N in globals.css.
 */

export type HeatStep = 0 | 1 | 2 | 3 | 4;

export const HEAT_STEPS = 5;

/**
 * Bucket a 0..100 value.
 *
 * Thresholds are deliberately NOT even fifths. An even split puts the top
 * step at 80+, and in the reference 83 is lime while 90 is ink — the ink step
 * is reserved for genuinely exceptional records, so it starts at 88. Sitting
 * the boundaries where they do also keeps the bulk of a normal spread in the
 * middle three steps rather than pinning everything at one end.
 */
const THRESHOLDS = [40, 60, 75, 88] as const;

/**
 * Even fifths, for values that have already been normalised.
 *
 * `heatInRange` used to route through `heatOf` and inherit the skewed
 * thresholds above, which was wrong and the test caught it: the exact midpoint
 * of a range came out at step 1 of 5. Those thresholds are shaped for SCORES,
 * which cluster high and want a hard-to-reach top step. A normalised position
 * is uniform by construction — the midpoint of a spread has to look like the
 * middle, or the legend lies.
 */
const EVEN_THRESHOLDS = [20, 40, 60, 80] as const;

function bucket(pct: number, thresholds: readonly number[]): HeatStep {
  const clamped = Math.min(100, Math.max(0, pct));
  let step = 0;
  for (const t of thresholds) {
    if (clamped >= t) step += 1;
  }
  return step as HeatStep;
}

export function heatOf(value: number | null | undefined): HeatStep {
  // Null is not zero. A record with no score is unknown, not cold, and
  // painting it rose would read as "bad" — callers should skip the chip
  // entirely. Returning the bottom step here is a fallback, not a licence.
  if (value == null || !Number.isFinite(value)) return 0;
  return bucket(value, THRESHOLDS);
}

/**
 * Bucket a value against a range rather than a fixed 0..100 scale.
 *
 * Deal amounts, invoice totals and project budgets have no natural ceiling,
 * so `heatOf` can't be used on them directly. This normalises against the
 * actual spread on screen — the biggest deal in the list is the hot one,
 * whatever its absolute size.
 *
 * Degenerate ranges (every value identical, or a single row) collapse to the
 * middle step. Returning 4 would paint an entire list black; returning 0
 * would paint it all rose. Neither is information.
 */
export function heatInRange(
  value: number | null | undefined,
  min: number,
  max: number
): HeatStep {
  if (value == null || !Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 2;
  const pct = ((value - min) / (max - min)) * 100;
  return bucket(pct, EVEN_THRESHOLDS);
}

/**
 * CSS custom-property pair for a step.
 *
 * Returned as inline style rather than a Tailwind class because the class
 * would have to be one of five literals for the JIT to see it, and every
 * call site would need its own switch. One function, five tokens.
 */
export function heatStyle(step: HeatStep): React.CSSProperties {
  return {
    background: `var(--heat-${step})`,
    color: `var(--heat-${step}-fg)`,
  };
}

/**
 * Where a value sits on the wash gradient, 0..1.
 *
 * The wash runs lime → cream → peach → rose along its diagonal, which is the
 * heat ramp reversed: hot is at the START. A record's chip and the corner of
 * the pane it opens should agree, so this exists to keep that relationship in
 * one place rather than inverted by hand at each call site.
 */
export function washPositionOf(step: HeatStep): number {
  return 1 - step / (HEAT_STEPS - 1);
}
