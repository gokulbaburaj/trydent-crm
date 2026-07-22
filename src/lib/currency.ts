"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

export type CurrencyCode = "USD" | "INR" | "EUR" | "CAD" | "AUD" | "AED";

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "AED", label: "UAE Dirham", symbol: "AED" },
];

const DISPLAY_KEY = "trydent-currency";
const BASE_KEY = "trydent-base-currency";
const RATES_KEY = "trydent-fx";
const EVENT = "trydent-currency-change";

/** Refetch rates when the cache is older than this. */
const RATE_TTL = 6 * 60 * 60 * 1000;

interface Rates {
  base: CurrencyCode;
  rates: Record<string, number>;
  fetchedAt: number;
}

interface Snapshot {
  /** What the viewer wants to see money in. */
  display: CurrencyCode;
  /** What money is actually stored in (global, set in Settings). */
  base: CurrencyCode;
  rates: Rates | null;
}

const SERVER_SNAPSHOT: Snapshot = { display: "USD", base: "USD", rates: null };

let snapshot: Snapshot = SERVER_SNAPSHOT;
let started = false;

function isCode(v: unknown): v is CurrencyCode {
  return typeof v === "string" && CURRENCIES.some((c) => c.code === v);
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

/** Replace the snapshot (new object ⇒ subscribers re-render) and notify. */
function commit(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function readLocal(): Snapshot {
  const display = window.localStorage.getItem(DISPLAY_KEY);
  const base = window.localStorage.getItem(BASE_KEY);
  let rates: Rates | null = null;
  try {
    const raw = window.localStorage.getItem(RATES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Rates;
      if (parsed && isCode(parsed.base) && parsed.rates) rates = parsed;
    }
  } catch {
    rates = null;
  }
  return {
    display: isCode(display) ? display : "USD",
    base: isCode(base) ? base : "USD",
    rates,
  };
}

/** Pull the global base currency, then make sure we have fresh rates for it. */
async function refresh(currentBase: CurrencyCode) {
  let base = currentBase;

  const supabase = createClient();
  if (supabase) {
    const { data } = await supabase.from("app_settings").select("base_currency").maybeSingle();
    const fetched = (data as { base_currency?: string } | null)?.base_currency;
    if (isCode(fetched) && fetched !== base) {
      base = fetched;
      window.localStorage.setItem(BASE_KEY, base);
      commit({ base });
    }
  }

  const cached = snapshot.rates;
  const fresh =
    cached && cached.base === base && Date.now() - cached.fetchedAt < RATE_TTL;
  if (fresh) return;

  try {
    const res = await fetch(`/api/fx?base=${base}`);
    if (!res.ok) return;
    const json = (await res.json()) as Rates;
    if (!json?.rates) return;
    const next: Rates = { base, rates: json.rates, fetchedAt: Date.now() };
    window.localStorage.setItem(RATES_KEY, JSON.stringify(next));
    commit({ rates: next });
  } catch {
    // Offline or rate service down — we keep formatting in the base currency.
  }
}

function start() {
  // Synchronous part: whatever we already know, so the first paint is right.
  snapshot = readLocal();
  // Async part: confirm the base currency and top up the rates.
  void refresh(snapshot.base);
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Snapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  if (!started) {
    started = true;
    start();
  }
  return snapshot;
}

export function formatMoney(value: number, currency: CurrencyCode) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

/** Change the app-wide base currency that money is stored in (admin action). */
export async function setBaseCurrency(code: CurrencyCode) {
  const supabase = createClient();
  if (supabase) {
    await supabase.from("app_settings").update({ base_currency: code }).eq("id", true);
  }
  window.localStorage.setItem(BASE_KEY, code);
  commit({ base: code });
  await refresh(code);
}

/**
 * Money display. Values are stored in the app's base currency and converted to
 * the viewer's chosen currency at live rates. If rates aren't available we
 * format in the base currency rather than showing a converted-looking number
 * that isn't converted.
 */
export function useCurrency() {
  const { display, base, rates } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );

  const setCurrency = (code: CurrencyCode) => {
    window.localStorage.setItem(DISPLAY_KEY, code);
    commit({ display: code });
  };

  /** Convert a base-currency amount into whatever we can honestly show. */
  const convert = (value: number): { value: number; code: CurrencyCode } => {
    if (display === base) return { value, code: base };
    const rate = rates && rates.base === base ? rates.rates[display] : undefined;
    if (!rate) return { value, code: base };
    return { value: value * rate, code: display };
  };

  const format = (value: number) => {
    const c = convert(value);
    return formatMoney(c.value, c.code);
  };

  return {
    /** Viewer's chosen display currency. */
    currency: display,
    setCurrency,
    /** Currency all amounts are stored in. */
    base,
    /** True when we can actually convert to the chosen currency. */
    converted: display === base || !!(rates && rates.base === base && rates.rates[display]),
    ratesFetchedAt: rates?.fetchedAt ?? null,
    convert,
    format,
  };
}

/** Read-only base currency for inputs that need to label their amounts. */
export function useBaseCurrency(): CurrencyCode {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT).base;
}
