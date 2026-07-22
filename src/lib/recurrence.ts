import { addDays, addMonths, format, parseISO } from "date-fns";
import type { Activity, ProjectTask, Recurrence } from "@/lib/types";

export const RECURRENCE_META: Record<Recurrence, { label: string; short: string }> = {
  none: { label: "Does not repeat", short: "Once" },
  daily: { label: "Every day", short: "Daily" },
  weekly: { label: "Every week", short: "Weekly" },
  biweekly: { label: "Every 2 weeks", short: "Biweekly" },
  monthly: { label: "Every month", short: "Monthly" },
};

/** Advance a Date by one recurrence step. `none` returns the same date. */
export function advanceDate(date: Date, recurrence: Recurrence): Date {
  switch (recurrence) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1);
    default:
      return date;
  }
}

/**
 * Next occurrence for a date string, preserving its shape:
 * `yyyy-MM-dd` in → `yyyy-MM-dd` out (task due dates);
 * anything with a time (activity_date) keeps its `HH:mm` clock time.
 * Returns null when there's no date or recurrence is `none`.
 */
export function nextOccurrence(
  value: string | null | undefined,
  recurrence: Recurrence
): string | null {
  if (!value || recurrence === "none") return null;
  const dateOnly = value.length <= 10;
  const base = dateOnly ? parseISO(value) : new Date(value);
  const next = advanceDate(base, recurrence);
  if (dateOnly) return format(next, "yyyy-MM-dd");
  return format(next, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Build the insert payload for a recurring task's next occurrence, or null
 * if none is due. Returns null when recurrence is `none` or when a child was
 * already spawned from this task (so toggling Done off/on won't duplicate).
 * Falls back to today as the base date when the task has no due date.
 */
export function nextTaskPayload(
  task: ProjectTask,
  existing: ProjectTask[]
): Partial<ProjectTask> | null {
  if (task.recurrence === "none") return null;
  if (existing.some((t) => t.recurrence_parent_id === task.id)) return null;
  const base = task.due_date ?? format(new Date(), "yyyy-MM-dd");
  const due = nextOccurrence(base, task.recurrence);
  return {
    project_id: task.project_id,
    name: task.name,
    status: "Not Started",
    due_date: due,
    assigned_to: task.assigned_to,
    sort_order: task.sort_order,
    description: task.description,
    links: task.links,
    label: task.label,
    priority: task.priority,
    recurrence: task.recurrence,
    recurrence_parent_id: task.id,
  };
}

/**
 * Build the insert payload for a recurring schedule item's next occurrence,
 * or null. Advances past any occurrences that already elapsed so the new item
 * lands in the future (a weekly meeting left untouched for a month jumps to
 * next week, not backfilling every missed date). De-duplicates via
 * recurrence_parent_id the same way as tasks.
 */
export function nextActivityPayload(
  activity: Activity,
  existing: Activity[],
  now: Date = new Date()
): Partial<Activity> | null {
  if (activity.recurrence === "none") return null;
  if (existing.some((a) => a.recurrence_parent_id === activity.id)) return null;
  let activity_date = nextOccurrence(activity.activity_date, activity.recurrence);
  let guard = 0;
  while (activity_date && new Date(activity_date) < now && guard < 520) {
    activity_date = nextOccurrence(activity_date, activity.recurrence);
    guard++;
  }
  if (!activity_date) return null;
  return {
    description: activity.description,
    outcome: activity.outcome,
    location: activity.location,
    follow_up_required: activity.follow_up_required,
    client_id: activity.client_id,
    deal_id: activity.deal_id,
    assigned_to: activity.assigned_to,
    activity_date,
    color: activity.color,
    recurrence: activity.recurrence,
    recurrence_parent_id: activity.id,
  };
}
