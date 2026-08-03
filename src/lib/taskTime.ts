/**
 * Where a task sits in time.
 *
 * Tasks carry a date plus an OPTIONAL time (see 2026-08-03d). Null time means
 * all-day. Every calendar in the app — Schedule, the project calendar, the
 * portal views — needs the same answer to "does this have a time, and where
 * does it go", so the arithmetic lives here once. Three copies of this would
 * drift, and the one that drifted would be the one nobody looked at.
 */

/** "14:30:00" or "14:30" -> minutes since midnight. Null for anything else. */
export function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":");
  const hours = Number(h);
  const mins = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

/** "14:30:00" -> "2:30 PM". Empty string when there's no time to show. */
export function formatTime(time: string | null | undefined): string {
  const total = minutesOf(time);
  if (total == null) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "2:30 PM – 4:00 PM", or just the start when there's no end. */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const from = formatTime(start);
  if (!from) return "";
  const to = formatTime(end);
  return to ? `${from} – ${to}` : from;
}

export interface Scheduled {
  due_date: string | null;
  due_time?: string | null;
  end_time?: string | null;
}

/** All-day items sort above timed ones, which is how calendars stack them. */
export function isAllDay(item: Scheduled): boolean {
  return !!item.due_date && minutesOf(item.due_time) == null;
}

/**
 * Sort key within a single day: all-day first, then by start time.
 *
 * -1 rather than 0 for all-day, so an item at exactly midnight still sorts
 * after the all-day block rather than tying with it.
 */
export function dayOrder(item: Scheduled): number {
  return minutesOf(item.due_time) ?? -1;
}

/**
 * Where to draw a timed item in a day grid, as fractions of the day.
 *
 * Returns null for all-day items — they belong in the header strip, not the
 * grid. A block with no end is given a default height so it stays clickable;
 * 30 minutes is short enough not to imply a duration that wasn't entered.
 */
export function gridPosition(
  item: Scheduled,
  defaultMinutes = 30
): { topPct: number; heightPct: number } | null {
  const start = minutesOf(item.due_time);
  if (start == null) return null;
  const end = minutesOf(item.end_time) ?? start + defaultMinutes;
  const DAY = 24 * 60;
  const clampedEnd = Math.min(end, DAY);
  return {
    topPct: (start / DAY) * 100,
    heightPct: (Math.max(clampedEnd - start, 15) / DAY) * 100,
  };
}

/**
 * A real Date for the item's start, for anything that needs to compare across
 * days. All-day items resolve to local midnight.
 *
 * Built from parts rather than `new Date("2026-08-10T14:00")` because that
 * string form is parsed inconsistently, and a date-only string is treated as
 * UTC — which is what put a task on the wrong day the last time this came up.
 */
export function startDate(item: Scheduled): Date | null {
  if (!item.due_date) return null;
  const [y, m, d] = item.due_date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const mins = minutesOf(item.due_time) ?? 0;
  return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60);
}
