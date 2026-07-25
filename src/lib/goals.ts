import { parseISO } from "date-fns";
import type {
  Client,
  CurrencyCode,
  Deal,
  Goal,
  Invoice,
  KeyResult,
  ProjectTask,
} from "@/lib/types";

/**
 * Live values for key results.
 *
 * Everything except a `manual` key result reads straight from rows the CRM
 * already has, filtered to the goal's date window. Nobody has to remember to
 * update a number, which is the whole reason OKRs rot in a spreadsheet.
 *
 * Money is summed in the base currency via the `toBase` converter the caller
 * passes in, so a goal spanning USD and INR deals still adds up.
 */

export interface MetricSources {
  deals: Deal[];
  clients: Client[];
  tasks: ProjectTask[];
  invoices: Invoice[];
  /** From useCurrency() — converts a deal/invoice amount into base currency. */
  toBase: (value: number, from: CurrencyCode) => number;
  base: CurrencyCode;
}

/** Inclusive on both ends. A goal with no dates counts everything. */
function withinPeriod(goal: Goal, date: string | null | undefined): boolean {
  if (!date) return false;
  const t = parseISO(date).getTime();
  if (goal.start_date && t < parseISO(goal.start_date).getTime()) return false;
  if (goal.end_date && t > parseISO(`${goal.end_date}T23:59:59`).getTime()) return false;
  return true;
}

export function currentValue(kr: KeyResult, goal: Goal, src: MetricSources): number {
  const ccy = (c: string | null | undefined): CurrencyCode =>
    (c as CurrencyCode) ?? src.base;

  switch (kr.source) {
    case "manual":
      return Number(kr.current_manual) || 0;

    case "revenue_won":
      return src.deals
        .filter((d) => d.deal_stage === "Closed Won" && withinPeriod(goal, d.close_date))
        .reduce((sum, d) => sum + src.toBase(Number(d.deal_value), ccy(d.currency)), 0);

    case "deals_closed":
      return src.deals.filter(
        (d) => d.deal_stage === "Closed Won" && withinPeriod(goal, d.close_date)
      ).length;

    case "new_clients":
      return src.clients.filter((c) => withinPeriod(goal, c.created_at)).length;

    case "tasks_done":
      return src.tasks.filter(
        (t) => t.status === "Done" && withinPeriod(goal, t.updated_at)
      ).length;

    case "invoices_paid":
      return src.invoices
        .filter((i) => i.status === "paid" && withinPeriod(goal, i.issue_date))
        .reduce((sum, i) => sum + src.toBase(Number(i.amount), ccy(i.currency)), 0);

    default:
      return 0;
  }
}

/** Capped at 100 so a smashed target doesn't blow out the ring geometry. */
export function keyResultPct(kr: KeyResult, goal: Goal, src: MetricSources): number {
  const target = Number(kr.target);
  if (!target) return 0;
  return Math.min(100, Math.round((currentValue(kr, goal, src) / target) * 100));
}

/** A goal's progress is the mean of its key results — the standard OKR roll-up. */
export function goalPct(krs: KeyResult[], goal: Goal, src: MetricSources): number {
  if (krs.length === 0) return 0;
  const total = krs.reduce((sum, kr) => sum + keyResultPct(kr, goal, src), 0);
  return Math.round(total / krs.length);
}

/** Money-shaped metrics render through the currency formatter, counts don't. */
export function isMoneySource(source: KeyResult["source"]): boolean {
  return source === "revenue_won" || source === "invoices_paid";
}
