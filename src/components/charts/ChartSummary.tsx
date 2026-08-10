/**
 * The screen-reader half of a chart.
 *
 * ── Why this is needed ──────────────────────────────────────────────────────
 *
 * Every chart in the app renders through one `<svg aria-hidden="true">`. That
 * is the correct decision for the SVG itself — a bare chart exposes hundreds
 * of unlabelled `<path>` and `<rect>` nodes, and reading them aloud produces
 * noise, not information. Hiding it is what the vendored chart library does by
 * default and it should stay.
 *
 * What was missing is the other half. `aria-hidden` on the graphic is only
 * correct when an equivalent exists somewhere else; on its own it means a
 * screen reader user gets a Card with a heading and then silence where the
 * data was. Ten charts across four pages were in that state.
 *
 * ── Why a table rather than a sentence ──────────────────────────────────────
 *
 * A generated summary ("revenue rose over the period") is a claim this
 * component can't actually verify, and it's the kind of text that goes stale
 * against the data behind it. The values themselves can't be wrong. A table
 * also satisfies the stronger rule — an actual tabular alternative — rather
 * than only the descriptive one, and it's navigable: a screen reader can move
 * cell by cell instead of hearing one long run-on string.
 *
 * Visually hidden, not `display: none` — the latter removes it from the
 * accessibility tree too, which would defeat the point.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   <ChartSummary
 *     label="Deals by stage"
 *     rows={stageData.map((s) => [s.label, String(s.value)])}
 *   />
 *
 * Sits as a sibling of the chart, inside the same Card. Pass values already
 * formatted the way a sighted reader sees them — a raw 1200000 next to a
 * visible "$1.2M" is a different answer to the same question.
 */
export function ChartSummary({
  label,
  rows,
  valueHeader = "Value",
  keyHeader = "Item",
}: {
  label: string;
  /** [name, formatted value] pairs, in the order the chart draws them. */
  rows: [string, string][];
  valueHeader?: string;
  keyHeader?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="sr-only">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{keyHeader}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
