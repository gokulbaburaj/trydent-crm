/*
  `.ts` on the runtime import, not on the type one.

  Type imports are erased before Node sees them, so they resolve either way.
  `effectiveInvoiceStatus` is a real function that has to exist at runtime, and
  the test runner uses type-stripping rather than a bundler — no extension
  means ERR_MODULE_NOT_FOUND when the suite runs, while the app builds fine.
  A test file that can't even load is the loudest possible version of this
  mistake, which is the only reason it's cheap.
*/
import { effectiveInvoiceStatus } from "./types.ts";
import type { Invoice, InvoiceStatus } from "./types";

/**
 * Invoice stages and ageing.
 *
 * Third time this shape has come up — deals have "Closed Lost", projects have
 * "On Hold", invoices have "overdue". In every case a value that looks like a
 * status is really something else, and rendering it as the next step in a line
 * says something untrue.
 */

/** The stages an invoice genuinely passes through. */
export const INVOICE_STEPS: InvoiceStatus[] = ["draft", "sent", "paid"];

const LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
};

export type StepTone = "neutral" | "positive" | "negative";

export interface InvoiceStep {
  id: InvoiceStatus;
  label: string;
  tone: StepTone;
}

/**
 * Steps to render.
 *
 * "overdue" is NOT a fourth step. It's the state of having been sent and not
 * paid in time — the invoice hasn't moved anywhere, the date passed. So it
 * tones the SENT step negative and relabels it, rather than appending a stage
 * the invoice never entered.
 *
 * This is the difference from a lost deal, which really did reach a terminal
 * the deal can't leave. An overdue invoice is still on its way to paid.
 */
export function invoiceSteps(invoice: Pick<Invoice, "status" | "due_date">): InvoiceStep[] {
  const effective = effectiveInvoiceStatus(invoice as Invoice);
  return INVOICE_STEPS.map((s) => {
    if (s === "paid") {
      return { id: s, label: LABELS[s], tone: "positive" as const };
    }
    if (s === "sent" && effective === "overdue") {
      return { id: s, label: "Overdue", tone: "negative" as const };
    }
    return { id: s, label: LABELS[s], tone: "neutral" as const };
  });
}

/** Index of the current step. Overdue stays on `sent` — it hasn't moved. */
export function currentInvoiceStep(status: InvoiceStatus): number {
  const i = INVOICE_STEPS.indexOf(status);
  return i === -1 ? 0 : i;
}

const DAY_MS = 86_400_000;

/**
 * How many days past due, as a positive number. Zero when not overdue.
 *
 * Only a SENT invoice can be overdue. A draft past its due date is a draft
 * someone forgot to send — a different problem, and calling it overdue would
 * put it in a chase-the-client queue it doesn't belong in. A paid one is
 * finished regardless of when it was paid.
 *
 * End of day, not midnight: an invoice due today isn't late until today is
 * over. Comparing against midnight makes everything due today read as one day
 * overdue from the moment the date rolls.
 */
export function daysOverdue(
  invoice: Pick<Invoice, "status" | "due_date">,
  now: number
): number {
  if (invoice.status !== "sent" || !invoice.due_date) return 0;
  const end = new Date(`${invoice.due_date}T23:59:59`).getTime();
  if (!Number.isFinite(end) || end >= now) return 0;
  return Math.floor((now - end) / DAY_MS) + 1;
}

/**
 * Days until due, positive. Zero once due or past it.
 *
 * The mirror of daysOverdue, and deliberately a separate function: a single
 * signed number reads fine in code and terribly at a call site, where
 * `days > 0` silently means opposite things depending on which way you defined
 * it.
 */
export function daysUntilDue(
  invoice: Pick<Invoice, "status" | "due_date">,
  now: number
): number {
  if (invoice.status !== "sent" || !invoice.due_date) return 0;
  const end = new Date(`${invoice.due_date}T23:59:59`).getTime();
  if (!Number.isFinite(end) || end < now) return 0;
  return Math.ceil((end - now) / DAY_MS);
}

export type AgeingBucket =
  | "Overdue"
  | "Due this week"
  | "Due later"
  | "Draft"
  | "Paid";

/**
 * Which group a row belongs to in the queue.
 *
 * Ordered by what needs doing: money you're owed and late for, then money
 * coming, then things you haven't sent, then done. Paid last because a paid
 * invoice needs nothing from anyone.
 */
export function ageingBucket(
  invoice: Pick<Invoice, "status" | "due_date">,
  now: number
): AgeingBucket {
  if (invoice.status === "paid") return "Paid";
  if (invoice.status === "draft") return "Draft";
  if (daysOverdue(invoice, now) > 0) return "Overdue";
  const until = daysUntilDue(invoice, now);
  // No due date on a sent invoice: nothing to chase against, so it sits with
  // the not-urgent pile rather than inventing a deadline.
  if (until > 0 && until <= 7) return "Due this week";
  return "Due later";
}

export const BUCKET_ORDER: AgeingBucket[] = [
  "Overdue",
  "Due this week",
  "Due later",
  "Draft",
  "Paid",
];

/**
 * Urgency as 0..100, for the heat scale.
 *
 * Heat here is NOT the amount. The amount is already printed on every row, and
 * a large invoice paid on time needs nothing from you. What you can't see at a
 * glance is how late a thing is, so that's what gets coloured.
 *
 * Saturates at 60 days: past two months the difference between 60 and 200 days
 * late is not a difference in what you do next.
 */
export function urgency(
  invoice: Pick<Invoice, "status" | "due_date">,
  now: number
): number {
  if (invoice.status === "paid") return 0;
  const over = daysOverdue(invoice, now);
  if (over > 0) return Math.min(100, 60 + Math.min(over, 60) * (40 / 60));
  const until = daysUntilDue(invoice, now);
  if (invoice.status === "draft") return 10;
  if (until === 0) return 55; // sent, no due date
  // Due in a week → 50. Due in two months → near 0.
  return Math.max(0, Math.min(55, 55 - (until - 7) * (55 / 53)));
}
