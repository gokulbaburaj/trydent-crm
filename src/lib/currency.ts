"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CurrencyCode } from "@/lib/types";
import {
  type Rates,
  canConvertTo,
  convertAmount as convert,
  formatConverted,
  isCode,
  resolveMoney,
  toBaseAmount,
} from "@/lib/fx";

/* The maths lives in `lib/fx.ts` — pure, and therefore testable. This module
   owns the parts that can't be: the store, the fetch and the hook. Re-exported
   here so call sites keep importing from "@/lib/currency". */
export type { CurrencyCode };
export { CURRENCIES, formatMoney } from "@/lib/fx";

const DISPLAY_KEY = "trydent-currency";
const BASE_KEY = "trydent-base-currency";
const RATES_KEY = "trydent-fx";
const EVENT = "trydent-currency-change";

/** Refetch rates when the cache is older than this. */
const RATE_TTL = 6 * 60 * 60 * 1000;

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

  /*
   * Memoised, and that is load-bearing rather than micro-optimisation.
   *
   * Rates arrive after first paint, and until they do `toBase` returns amounts
   * unconverted. Callers wrap their sums in `useMemo`, so a fresh closure every
   * render leaves no honest dependency to list: include it and you recompute
   * every render, omit it and the sum is computed once with no rates and never
   * corrected. Dashboard and Pipeline took the second option behind an
   * `exhaustive-deps` suppression, and multi-currency totals were added at 1:1
   * forever.
   *
   * `getSnapshot` returns a module-level cached object, so `base`, `rates` and
   * `display` are stable between real changes — which makes these stable too,
   * and a caller gets exactly one recompute when the FX data actually moves.
   *
   * The maths itself is in `lib/fx.ts`; these are just the bindings.
   */
  const convertAmount = useCallback(
    (value: number, from: CurrencyCode, to: CurrencyCode) =>
      convert(rates, base, value, from, to),
    [rates, base]
  );

  const toBase = useCallback(
    (value: number, from: CurrencyCode = base) => toBaseAmount(rates, base, value, from),
    [rates, base]
  );

  const format = useCallback(
    (value: number, from: CurrencyCode = base) =>
      formatConverted(rates, base, value, from, display),
    [rates, base, display]
  );

  /*
    Same conversion, returned as parts rather than a string, for <Money>.

    Memoised for the same load-bearing reason as `toBase` and `format` — rates
    arrive after first paint, and a fresh closure per render would either make
    callers recompute every render or never correct themselves once the rates
    land. See the note above and the `useCurrency` entry in CLAUDE.md.
  */
  const resolve = useCallback(
    (value: number, from: CurrencyCode = base) =>
      resolveMoney(rates, base, value, from, display),
    [rates, base, display]
  );

  return {
    /** Viewer's chosen display currency. */
    currency: display,
    setCurrency,
    /** Default currency for new amounts (set in Settings). */
    base,
    /** True when the chosen display currency can be converted to. */
    converted: canConvertTo(rates, base, display),
    ratesFetchedAt: rates?.fetchedAt ?? null,
    convertAmount,
    toBase,
    format,
    /** Conversion as parts, for the animated <Money> component. */
    resolve,
  };
}

/** Read-only base currency for inputs that need to label their amounts. */
export function useBaseCurrency(): CurrencyCode {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT).base;
}
