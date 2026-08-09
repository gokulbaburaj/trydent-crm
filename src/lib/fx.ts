import type { CurrencyCode } from "@/lib/types";

/**
 * Currency maths, with nothing around it.
 *
 * This was inside `lib/currency.ts`, tangled with a `useSyncExternalStore`
 * cache, a Supabase call and a localStorage read — so the one part of the app
 * that turns one number into a different number could not be tested at all. A
 * test runner can't import that module: React and the Supabase client are
 * evaluated at module scope.
 *
 * That mattered. The stale-totals bug on 4 Aug — Dashboard and Pipeline adding
 * multi-currency deals at 1:1 and never correcting once real rates arrived —
 * lived in this logic and shipped unnoticed because there was nothing to run
 * against it.
 *
 * Everything here is a pure function of its arguments. `currency.ts` still owns
 * the store, the fetch and the hook, and delegates to these.
 */

export type { CurrencyCode };

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "AED", label: "UAE Dirham", symbol: "AED" },
];

export interface Rates {
  /** The currency these rates are expressed relative to. */
  base: CurrencyCode;
  /** rate(code) = units of `code` per 1 base. */
  rates: Record<string, number>;
  fetchedAt: number;
}

export function isCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && CURRENCIES.some((c) => c.code === v);
}

/**
 * Units of `code` per 1 base. Null when we can't say.
 *
 * Null rather than 1 on purpose: a missing rate is not parity, and returning 1
 * would silently add unlike currencies together — which is the exact bug this
 * module exists to prevent.
 */
export function rateOf(
  rates: Rates | null,
  base: CurrencyCode,
  code: CurrencyCode
): number | null {
  if (code === base) return 1;
  // Rates fetched against a different base are not usable here. The base can be
  // changed in Settings, and the cached table outlives that change.
  if (!rates || rates.base !== base) return null;
  const r = rates.rates[code];
  return typeof r === "number" && r > 0 ? r : null;
}

/** Convert between any two currencies via the base-relative table. */
export function convertAmount(
  rates: Rates | null,
  base: CurrencyCode,
  value: number,
  from: CurrencyCode,
  to: CurrencyCode
): number | null {
  if (from === to) return value;
  const rf = rateOf(rates, base, from);
  const rt = rateOf(rates, base, to);
  if (rf == null || rt == null) return null;
  return (value / rf) * rt;
}

/**
 * Bring an amount into the base currency so it can be summed.
 *
 * Falls back to the amount unconverted when rates are missing. That is a
 * deliberate lie with a short life — it keeps totals rendering before the FX
 * fetch resolves — and it is precisely why callers must recompute when rates
 * arrive. See the memoisation note in `currency.ts`.
 */
export function toBaseAmount(
  rates: Rates | null,
  base: CurrencyCode,
  value: number,
  from: CurrencyCode
): number {
  const c = convertAmount(rates, base, value, from, base);
  return c == null ? value : c;
}

/** True when `display` can actually be shown, rather than faked. */
export function canConvertTo(
  rates: Rates | null,
  base: CurrencyCode,
  display: CurrencyCode
): boolean {
  return display === base || rateOf(rates, base, display) != null;
}

export function formatMoney(value: number, currency: CurrencyCode) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/**
 * Format an amount stored in `from`, shown in `display`.
 *
 * When it can't convert it formats in the source currency rather than printing
 * a converted-looking number that wasn't converted. A wrong number that looks
 * right is worse than an honest one in the wrong denomination.
 */
export function formatConverted(
  rates: Rates | null,
  base: CurrencyCode,
  value: number,
  from: CurrencyCode,
  display: CurrencyCode
): string {
  const { amount, currency } = resolveMoney(rates, base, value, from, display);
  return formatMoney(amount, currency);
}

/**
 * The same decision as `formatConverted`, but returning the PARTS rather than
 * a finished string.
 *
 * NumberFlow needs a number and a currency code — it does its own Intl
 * formatting so it can animate individual digits. Handing it a pre-formatted
 * string would mean parsing "₹1,20,000" back into a number, which is a
 * locale-dependent guess.
 *
 * `formatConverted` is implemented in terms of this rather than the two
 * existing side by side, so the fallback rule — when rates are missing, show
 * the SOURCE currency rather than a converted-looking number that wasn't
 * converted — can't drift between the animated and static paths.
 */
export function resolveMoney(
  rates: Rates | null,
  base: CurrencyCode,
  value: number,
  from: CurrencyCode,
  display: CurrencyCode
): { amount: number; currency: CurrencyCode; converted: boolean } {
  const c = convertAmount(rates, base, value, from, display);
  if (c == null) return { amount: value, currency: from, converted: false };
  return { amount: c, currency: display, converted: from !== display };
}
