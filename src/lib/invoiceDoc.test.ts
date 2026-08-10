import test from "node:test";
import assert from "node:assert/strict";
import { addressLines, invoiceTotals, lineAmount, upiPaymentUri } from "./invoiceDoc.ts";

test("a line is quantity times unit price", () => {
  assert.equal(lineAmount({ quantity: 3, unit_price: 5000 }), 15000);
  assert.equal(lineAmount({ quantity: 1, unit_price: 10000 }), 10000);
});

test("numeric strings from Postgres are handled", () => {
  // supabase-js returns `numeric` as a string; a bare * would coerce but a
  // bare + elsewhere would concatenate, so this is worth pinning.
  assert.equal(lineAmount({ quantity: "2", unit_price: "2500.50" }), 5001);
});

test("a malformed line is 0, not NaN", () => {
  // NaN spreads into the total and prints as "₹NaN" on a document sent to a
  // client.
  assert.equal(lineAmount({ quantity: "abc", unit_price: 100 }), 0);
  assert.equal(lineAmount({ quantity: 1, unit_price: "" as unknown as number }), 0);
});

test("totals sum the lines", () => {
  const totals = invoiceTotals([
    { quantity: 1, unit_price: 10000 },
    { quantity: 2, unit_price: 2500 },
  ]);
  assert.deepEqual(totals, { subtotal: 15000, adjustment: 0, total: 15000 });
});

test("printed lines add up to the printed total", () => {
  // 3 × 1666.67 = 5000.01. Rounding the SUM instead of each line can print
  // lines that don't reconcile with the total — the one thing a client checks.
  const lines = [
    { quantity: 3, unit_price: 1666.67 },
    { quantity: 3, unit_price: 1666.67 },
  ];
  const totals = invoiceTotals(lines);
  const printed = lines.reduce(
    (sum, l) => sum + Math.round(lineAmount(l) * 100) / 100,
    0
  );
  assert.equal(totals.subtotal, Math.round(printed * 100) / 100);
  assert.equal(totals.total, totals.subtotal);
});

test("float noise never reaches the document", () => {
  const totals = invoiceTotals([
    { quantity: 1, unit_price: 0.1 },
    { quantity: 1, unit_price: 0.2 },
  ]);
  assert.equal(totals.subtotal, 0.3);
});

test("an adjustment moves the total but not the subtotal", () => {
  // The template has a hidden row between Subtotal and Total for exactly this.
  const totals = invoiceTotals([{ quantity: 1, unit_price: 10000 }], -1000);
  assert.equal(totals.subtotal, 10000);
  assert.equal(totals.adjustment, -1000);
  assert.equal(totals.total, 9000);
});

test("an invoice with no lines totals zero", () => {
  assert.deepEqual(invoiceTotals([]), { subtotal: 0, adjustment: 0, total: 0 });
});

test("the UPI uri carries payee, name and currency", () => {
  const uri = upiPaymentUri({ upiId: "gokubraj123@oksbi", payeeName: "Gokul Baburaj" });
  assert.ok(uri.startsWith("upi://pay?"));
  const q = new URLSearchParams(uri.slice("upi://pay?".length));
  assert.equal(q.get("pa"), "gokubraj123@oksbi");
  assert.equal(q.get("pn"), "Gokul Baburaj");
  assert.equal(q.get("cu"), "INR");
});

test("an amount is sent with two decimals, and omitted when nil", () => {
  const withAmount = upiPaymentUri({
    upiId: "a@b",
    payeeName: "X",
    amount: 10000,
  });
  assert.equal(new URLSearchParams(withAmount.split("?")[1]).get("am"), "10000.00");

  // A zero-amount QR that says "pay 0.00" is worse than one that lets the
  // payer type the figure.
  const nil = upiPaymentUri({ upiId: "a@b", payeeName: "X", amount: 0 });
  assert.equal(new URLSearchParams(nil.split("?")[1]).get("am"), null);
});

test("special characters in a payee name are encoded", () => {
  const uri = upiPaymentUri({ upiId: "a@b", payeeName: "Smith & Co" });
  assert.ok(!uri.includes("Smith & Co"), "raw ampersand would truncate the query");
  assert.equal(new URLSearchParams(uri.split("?")[1]).get("pn"), "Smith & Co");
});

test("address blocks split on newlines and drop blanks", () => {
  assert.deepEqual(addressLines("Kochi, Kerala\nIndia"), ["Kochi, Kerala", "India"]);
  assert.deepEqual(addressLines("  Kochi  \n\n  India  "), ["Kochi", "India"]);
  assert.deepEqual(addressLines(null), []);
  assert.deepEqual(addressLines(""), []);
});
