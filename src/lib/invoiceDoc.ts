import type { InvoiceLine } from "./types";

/**
 * The arithmetic behind a rendered invoice.
 *
 * Kept out of the document component because it's the part that can be wrong
 * in a way nobody notices until a client adds the column up themselves.
 */

export interface InvoiceTotals {
  subtotal: number;
  /** Reserved for the tax/discount row the template already has, hidden. */
  adjustment: number;
  total: number;
}

/**
 * A line's value.
 *
 * The database computes `amount` as a generated column, but a line being
 * composed in the UI hasn't been saved yet and has no amount — so this is the
 * one definition both paths use.
 */
export function lineAmount(line: { quantity: number | string; unit_price: number | string }): number {
  const qty = Number(line.quantity);
  const price = Number(line.unit_price);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return qty * price;
}

/**
 * Subtotal, adjustment and total.
 *
 * ── Why rounding happens here and only here ─────────────────────────────────
 *
 * Money in this app is `numeric` in Postgres and a JS number in the client. A
 * quantity of 3 at ₹1,666.67 is ₹5,000.01, and summing several of those in
 * floating point produces the classic 0.30000000000000004. Rounding each line
 * before summing, rather than rounding the sum, means the printed lines always
 * add up to the printed total — which is the property a client checks.
 */
export function invoiceTotals(
  lines: Pick<InvoiceLine, "quantity" | "unit_price">[],
  adjustment = 0
): InvoiceTotals {
  const subtotal = lines.reduce((sum, l) => sum + round2(lineAmount(l)), 0);
  const rounded = round2(subtotal);
  return {
    subtotal: rounded,
    adjustment: round2(adjustment),
    total: round2(rounded + adjustment),
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The `upi://` string a payment app expects, for the "Scan to Pay" QR.
 *
 * Built from the UPI ID rather than shipping a fixed QR image, because an
 * image can't notice when the ID beside it changes. The template's current QR
 * is a PNG of one specific address; edit the address in Settings and the
 * picture would keep pointing at the old one.
 *
 * `pn` (payee name) and `am` (amount) are optional in the spec but both are
 * worth sending: the name shows in the payer's app before they confirm, and a
 * prefilled amount removes the most common way to underpay an invoice.
 * Amount is omitted when zero so the QR stays valid for a nil invoice.
 */
export function upiPaymentUri(opts: {
  upiId: string;
  payeeName: string;
  amount?: number;
  note?: string;
}): string {
  const params = new URLSearchParams();
  params.set("pa", opts.upiId);
  params.set("pn", opts.payeeName);
  // UPI is an INR rail. A dollar invoice must not produce a QR implying the
  // figure is payable in rupees.
  params.set("cu", "INR");
  if (opts.amount && opts.amount > 0) params.set("am", opts.amount.toFixed(2));
  if (opts.note) params.set("tn", opts.note);
  return `upi://pay?${params.toString()}`;
}

/** Address blocks are stored with newlines; the document renders them as lines. */
export function addressLines(address: string | null | undefined): string[] {
  return (address ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
