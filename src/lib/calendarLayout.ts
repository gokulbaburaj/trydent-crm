/**
 * Side-by-side placement for overlapping calendar events.
 *
 * Lifted out of `(dashboard)/schedule/page.tsx` unchanged. It lived inside a
 * 1,300-line page component, which meant the only way to find out whether it
 * worked was to look at the rendered grid and squint — and that is exactly how
 * the 3 Aug punchlist ended up asserting there was no clustering here when
 * there always had been. Out here it can be imported by a test.
 *
 * The algorithm is the standard one. Walk events in start order, keeping a
 * cluster of things that overlap. Within a cluster each event takes the lowest
 * column not already occupied by something it collides with. When an event
 * starts after everything in the cluster has ended, the cluster is closed and
 * every member is told how many columns to divide by — so a pile of four gets
 * quarter-width each, and a lone event later in the day still gets full width.
 *
 * Duration is a parameter rather than a constant because the caller owns that
 * fiction: activities store only a start time, so the grid assumes an hour.
 */

export interface Timed<T> {
  item: T;
  /** Minutes since local midnight. */
  startMin: number;
}

export interface Placed<T> {
  item: T;
  /** Zero-based column within the cluster. */
  col: number;
  /** How many columns the cluster was split into. Width is `1 / cols`. */
  cols: number;
  startMin: number;
}

export function packColumns<T>(
  events: Timed<T>[],
  durationMinutes: number
): Placed<T>[] {
  // Array.prototype.sort is stable, so events starting at the same minute keep
  // the order they arrived in. Without that, four meetings at 15:30 could swap
  // columns between renders and appear to jitter.
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);

  const placed: Placed<T>[] = [];
  let cluster: { event: Timed<T>; col: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const cols = Math.max(...cluster.map((c) => c.col), 0) + 1;
    for (const c of cluster) {
      placed.push({
        item: c.event.item,
        col: c.col,
        cols,
        startMin: c.event.startMin,
      });
    }
    cluster = [];
  };

  for (const event of sorted) {
    const start = event.startMin;
    if (cluster.length > 0 && start >= clusterEnd) flush();

    const taken = cluster
      .filter((c) => c.event.startMin + durationMinutes > start)
      .map((c) => c.col);
    let col = 0;
    while (taken.includes(col)) col++;

    cluster.push({ event, col });
    clusterEnd = Math.max(clusterEnd, start + durationMinutes);
  }
  if (cluster.length > 0) flush();

  return placed;
}
