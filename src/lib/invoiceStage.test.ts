import test from "node:test";
import assert from "node:assert/strict";
import {
  BUCKET_ORDER,
  ageingBucket,
  currentInvoiceStep,
  daysOverdue,
  daysUntilDue,
  invoiceSteps,
  urgency,
} from "./invoiceStage.ts";
import { INVOICE_STATUSES } from "./types.ts";
import type { Invoice, InvoiceStatus } from "./types.ts";

/** Tests run with TZ=UTC (see the `test` script). */
const NOW = new Date("2026-08-10T12:00:00Z").getTime();

const inv = (status: InvoiceStatus, due_date: string | null = null) =>
  ({ status, due_date }) as Pick<Invoice, "status" | "due_date">;

test("overdue is not a fourth step — it tones the one the invoice is on", () => {
  // An overdue invoice hasn't moved anywhere. The date passed. Appending a
  // stage would claim it progressed from sent to overdue.
  const steps = invoiceSteps(inv("sent", "2026-08-01"));
  assert.equal(steps.length, 3);
  assert.equal(steps[1].label, "Overdue");
  assert.equal(steps[1].tone, "negative");
  assert.equal(steps[1].id, "sent", "the id stays sent — that's the stored value");
});

test("a sent-and-not-yet-due invoice reads as plain Sent", () => {
  const steps = invoiceSteps(inv("sent", "2026-09-01"));
  assert.equal(steps[1].label, "Sent");
  assert.equal(steps[1].tone, "neutral");
});

test("paid is always the positive terminal", () => {
  for (const s of INVOICE_STATUSES) {
    assert.equal(invoiceSteps(inv(s)).at(-1)!.tone, "positive");
  }
});

test("every stored status lands inside the step array", () => {
  for (const s of INVOICE_STATUSES) {
    const i = currentInvoiceStep(s);
    assert.ok(i >= 0 && i < invoiceSteps(inv(s)).length, `${s} gave ${i}`);
  }
  // A status this file doesn't know falls to the start, not out of bounds.
  assert.equal(currentInvoiceStep("nonsense" as InvoiceStatus), 0);
});

test("only a SENT invoice can be overdue", () => {
  const past = "2026-07-01";
  // A draft past its due date is a draft someone forgot to send. Different
  // problem, and it must not land in a chase-the-client queue.
  assert.equal(daysOverdue(inv("draft", past), NOW), 0);
  // Paid is finished regardless of when.
  assert.equal(daysOverdue(inv("paid", past), NOW), 0);
  assert.ok(daysOverdue(inv("sent", past), NOW) > 0);
});

test("due TODAY is not yet overdue", () => {
  // Comparing against midnight makes everything due today read as a day late
  // the moment the date rolls. The deadline is the end of the day.
  assert.equal(daysOverdue(inv("sent", "2026-08-10"), NOW), 0);
  assert.equal(daysOverdue(inv("sent", "2026-08-09"), NOW), 1);
});

test("a missing or malformed due date is never overdue", () => {
  assert.equal(daysOverdue(inv("sent", null), NOW), 0);
  assert.equal(daysOverdue(inv("sent", "not a date"), NOW), 0);
  assert.doesNotThrow(() => daysOverdue(inv("sent", "2026-13-45"), NOW));
});

test("daysOverdue and daysUntilDue are never both non-zero", () => {
  const dates = [null, "2026-07-01", "2026-08-10", "2026-08-11", "2026-12-01", "rubbish"];
  for (const d of dates) {
    const i = inv("sent", d);
    const over = daysOverdue(i, NOW);
    const until = daysUntilDue(i, NOW);
    assert.ok(over === 0 || until === 0, `${d}: over=${over} until=${until}`);
  }
});

test("buckets order by what needs doing", () => {
  assert.equal(ageingBucket(inv("sent", "2026-07-01"), NOW), "Overdue");
  assert.equal(ageingBucket(inv("sent", "2026-08-14"), NOW), "Due this week");
  assert.equal(ageingBucket(inv("sent", "2026-11-01"), NOW), "Due later");
  assert.equal(ageingBucket(inv("draft", "2026-07-01"), NOW), "Draft");
  assert.equal(ageingBucket(inv("paid", "2026-07-01"), NOW), "Paid");
  // Sent with no due date — nothing to chase against, so it isn't urgent.
  assert.equal(ageingBucket(inv("sent", null), NOW), "Due later");
});

test("every bucket ageingBucket can return appears in BUCKET_ORDER", () => {
  // Otherwise a group renders with no heading, or sorts to an undefined index.
  const cases = [
    inv("sent", "2026-07-01"), inv("sent", "2026-08-14"), inv("sent", "2026-11-01"),
    inv("sent", null), inv("draft"), inv("paid"),
  ];
  for (const c of cases) {
    assert.ok(BUCKET_ORDER.includes(ageingBucket(c, NOW)), ageingBucket(c, NOW));
  }
});

test("urgency rises with lateness and saturates", () => {
  const at = (d: string) => urgency(inv("sent", d), NOW);
  assert.ok(at("2026-08-09") < at("2026-07-11"), "1 day late < 30 days late");
  // Past two months, later is not more actionable.
  assert.equal(at("2026-06-01"), at("2020-01-01"));
  assert.equal(at("2020-01-01"), 100);
});

test("a paid invoice has zero urgency however large or late it was", () => {
  assert.equal(urgency(inv("paid", "2020-01-01"), NOW), 0);
});

test("urgency stays inside 0..100 for every shape", () => {
  const dates = [null, "2020-01-01", "2026-08-09", "2026-08-10", "2026-08-11", "2030-01-01", "junk"];
  for (const s of INVOICE_STATUSES) {
    for (const d of dates) {
      const u = urgency(inv(s, d), NOW);
      assert.ok(u >= 0 && u <= 100, `${s}/${d} gave ${u}`);
      assert.ok(Number.isFinite(u), `${s}/${d} gave ${u}`);
    }
  }
});

test("an overdue invoice always outranks one merely due", () => {
  // The queue is sorted by this. A one-day-late invoice must sit above one due
  // tomorrow, or the ordering says nothing.
  assert.ok(urgency(inv("sent", "2026-08-09"), NOW) > urgency(inv("sent", "2026-08-11"), NOW));
});
