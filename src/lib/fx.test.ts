import test from "node:test";
import assert from "node:assert/strict";
import {
  canConvertTo,
  convertAmount,
  formatConverted,
  formatMoney,
  isCode,
  rateOf,
  toBaseAmount,
  type Rates,
} from "./fx.ts";

/**
 * The money maths. A wrong answer here is a wrong number on an invoice, and
 * until 4 Aug none of it had a test — which is how Dashboard and Pipeline came
 * to add multi-currency deals together at 1:1 without anyone noticing.
 */

/** Rates relative to USD: 1 USD = 83 INR = 0.92 EUR = 1.5 AUD. */
const usdRates: Rates = {
  base: "USD",
  rates: { INR: 83, EUR: 0.92, AUD: 1.5 },
  fetchedAt: 0,
};

/* --------------------------------- rateOf -------------------------------- */

test("the base currency is always 1, even with no rate table", () => {
  assert.equal(rateOf(null, "USD", "USD"), 1);
  assert.equal(rateOf(usdRates, "USD", "USD"), 1);
});

test("rateOf reads the table for other currencies", () => {
  assert.equal(rateOf(usdRates, "USD", "INR"), 83);
  assert.equal(rateOf(usdRates, "USD", "EUR"), 0.92);
});

test("rateOf returns null rather than guessing", () => {
  assert.equal(rateOf(null, "USD", "INR"), null, "no rates at all");
  assert.equal(rateOf(usdRates, "USD", "CAD"), null, "currency missing from the table");
});

test("rates fetched against a different base are refused", () => {
  // The base is changeable in Settings and the cached table outlives the
  // change. Using an INR-based table as if it were USD-based silently
  // multiplies every figure by ~83.
  assert.equal(rateOf(usdRates, "INR", "EUR"), null);
});

test("a zero or negative rate is treated as missing", () => {
  const broken: Rates = { base: "USD", rates: { INR: 0, EUR: -1 }, fetchedAt: 0 };
  assert.equal(rateOf(broken, "USD", "INR"), null, "zero would divide by zero");
  assert.equal(rateOf(broken, "USD", "EUR"), null, "negative is nonsense");
});

/* ------------------------------ convertAmount ---------------------------- */

test("converting to the same currency is a no-op", () => {
  assert.equal(convertAmount(null, "USD", 250, "EUR", "EUR"), 250, "works without rates");
});

test("convertAmount goes through the base", () => {
  // 830 INR -> USD -> EUR. 830/83 = 10 USD, 10*0.92 = 9.2 EUR.
  // Compared with a tolerance because (830/83)*0.92 is 9.200000000000001 in
  // IEEE 754. Money is rounded at the formatting boundary, not here — keeping
  // full precision through the maths is what stops rounding compounding across
  // a summed column.
  const eur = convertAmount(usdRates, "USD", 830, "INR", "EUR")!;
  assert.ok(Math.abs(eur - 9.2) < 1e-9, `got ${eur}`);
});

test("convertAmount returns null when either side is unknown", () => {
  assert.equal(convertAmount(usdRates, "USD", 100, "CAD", "USD"), null);
  assert.equal(convertAmount(usdRates, "USD", 100, "USD", "CAD"), null);
});

test("converting there and back returns the original", () => {
  const there = convertAmount(usdRates, "USD", 1000, "INR", "AUD")!;
  const back = convertAmount(usdRates, "USD", there, "AUD", "INR")!;
  assert.ok(Math.abs(back - 1000) < 1e-9, `round trip gave ${back}`);
});

/* ------------------------------ toBaseAmount ----------------------------- */

test("toBaseAmount converts into the base", () => {
  assert.equal(toBaseAmount(usdRates, "USD", 830, "INR"), 10);
});

test("toBaseAmount passes the amount through when rates are missing", () => {
  // The documented, deliberate lie: totals render before the FX fetch lands.
  // It's why callers MUST recompute when rates arrive — the bug we shipped.
  assert.equal(toBaseAmount(null, "USD", 830, "INR"), 830);
  assert.equal(toBaseAmount(usdRates, "USD", 500, "CAD"), 500, "unknown currency");
});

test("summing mixed currencies without rates is wrong, and that is expected", () => {
  // Pins the failure mode rather than the fix. If this ever starts returning
  // the converted total, someone has changed the contract and the callers'
  // recompute-on-rates logic needs revisiting.
  const naive = toBaseAmount(null, "USD", 830, "INR") + toBaseAmount(null, "USD", 10, "USD");
  assert.equal(naive, 840, "830 INR + 10 USD added at 1:1");
  const correct = toBaseAmount(usdRates, "USD", 830, "INR") + toBaseAmount(usdRates, "USD", 10, "USD");
  assert.equal(correct, 20, "and 20 USD once rates exist");
});

/* ------------------------------ canConvertTo ----------------------------- */

test("canConvertTo is true for the base and for anything in the table", () => {
  assert.equal(canConvertTo(null, "USD", "USD"), true);
  assert.equal(canConvertTo(usdRates, "USD", "INR"), true);
});

test("canConvertTo is false when the rate is missing", () => {
  assert.equal(canConvertTo(null, "USD", "INR"), false);
  assert.equal(canConvertTo(usdRates, "USD", "CAD"), false);
});

/* -------------------------------- formatting ----------------------------- */

test("formatMoney uses the Indian grouping for rupees", () => {
  // 12,34,567 not 1,234,567 — the reason locale isn't hardcoded to en-US.
  const inr = formatMoney(1234567, "INR");
  assert.ok(inr.includes("12,34,567"), `got ${inr}`);
});

test("formatMoney has no decimal places", () => {
  const usd = formatMoney(1234.56, "USD");
  assert.ok(!usd.includes("."), `got ${usd}`);
});

test("formatMoney renders a missing amount as zero, not NaN", () => {
  assert.ok(formatMoney(0, "USD").includes("0"));
  assert.ok(!formatMoney(NaN, "USD").includes("NaN"), "NaN must never reach the UI");
});

test("formatConverted shows the source currency when it cannot convert", () => {
  // Honest wrong denomination beats a converted-looking number that isn't.
  const out = formatConverted(null, "USD", 830, "INR", "EUR");
  assert.ok(out.includes("830"), `expected the original amount, got ${out}`);
});

test("formatConverted converts when it can", () => {
  const out = formatConverted(usdRates, "USD", 830, "INR", "USD");
  assert.ok(out.includes("10"), `expected 10 USD, got ${out}`);
});

/* ---------------------------------- isCode ------------------------------- */

test("isCode accepts only supported currencies", () => {
  assert.equal(isCode("USD"), true);
  assert.equal(isCode("INR"), true);
  assert.equal(isCode("GBP"), false, "not in CURRENCIES");
  assert.equal(isCode(""), false);
  assert.equal(isCode(null), false);
  assert.equal(isCode(42), false);
});
