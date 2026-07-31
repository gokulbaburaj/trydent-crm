"use client";

import { PatternLines } from "@/components/charts/visx-pattern";

/**
 * Chart series colours, bklit style.
 *
 * The old scheme handed each series its own hue — indigo, blue, gold, pink,
 * green, red. Six unrelated colours on one dark card reads as decoration
 * rather than data, and none of them moved when you changed your accent, so a
 * chart never matched the app it sat in.
 *
 * bklit does the opposite and it's the reason its charts look calm: ONE hue,
 * stepped down in lightness, and when it runs out of usable steps it switches
 * to *texture* — a diagonal hatch — instead of reaching for a second hue.
 * Lightness and texture are both readable in greyscale and by anyone who can't
 * separate red from green, which a six-hue palette is not.
 *
 * Everything below derives from `--primary`, so the accent picker in Settings
 * now genuinely re-themes the charts.
 *
 * Order matters: series 0 is the one you want read first, so it gets the full
 * accent. Each step after it recedes.
 */

/** Pattern def ids. Render <ChartPatternDefs /> inside the chart to define these. */
export const HATCH_STRONG = "series-hatch-strong";
export const HATCH_SOFT = "series-hatch-soft";

/**
 * Fills in reading order. Solid steps first, then hatches — texture is the
 * cheapest way to add a distinguishable series without adding a colour.
 */
export const SERIES_FILLS: string[] = [
  "var(--chart-scale-05)", // full accent
  "var(--chart-scale-04)", // accent at 55%
  `url(#${HATCH_STRONG})`, // hatched accent
  "var(--chart-scale-03)", // neutral, 20% white
  `url(#${HATCH_SOFT})`, // hatched neutral
  "var(--chart-scale-02)", // neutral, 12% white
];

/**
 * A solid colour for every series, for places that can't paint an SVG pattern
 * — legend swatches, tooltip dots, the small square next to a label. A hatch
 * has no single colour, so these substitute the shade the hatch is drawn in.
 */
export const SERIES_SWATCHES: string[] = [
  "var(--chart-scale-05)",
  "var(--chart-scale-04)",
  "var(--chart-scale-04)",
  "var(--chart-scale-03)",
  "var(--chart-scale-03)",
  "var(--chart-scale-02)",
];

export function seriesFill(index: number): string {
  return SERIES_FILLS[index % SERIES_FILLS.length];
}

export function seriesSwatch(index: number): string {
  return SERIES_SWATCHES[index % SERIES_SWATCHES.length];
}

/**
 * Pattern definitions. Drop this inside any chart that uses a hatched series;
 * the chart hoists def children into its <defs> block.
 *
 * Two hatches rather than one because a single hatch shade sitting next to a
 * pale bar and a dark bar reads as belonging to whichever it's closer to.
 */
export function ChartPatternDefs() {
  return (
    <>
      <PatternLines
        id={HATCH_STRONG}
        height={6}
        width={6}
        stroke="var(--chart-scale-04)"
        strokeWidth={2}
        orientation={["diagonal"]}
      />
      <PatternLines
        id={HATCH_SOFT}
        height={6}
        width={6}
        stroke="var(--chart-scale-03)"
        strokeWidth={2}
        orientation={["diagonal"]}
      />
    </>
  );
}
