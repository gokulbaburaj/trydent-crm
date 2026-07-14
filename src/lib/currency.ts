"use client";

import { useSyncExternalStore } from "react";

export type CurrencyCode = "USD" | "INR" | "EUR" | "CAD" | "AUD" | "AED";

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$" },
  { code: "AED", label: "UAE Dirham", symbol: "AED" },
];

const STORAGE_KEY = "trydent-currency";
const EVENT = "trydent-currency-change";

export function getStoredCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "USD";
  const v = window.localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
  return v && CURRENCIES.some((c) => c.code === v) ? v : "USD";
}

export function formatMoney(value: number, currency: CurrencyCode) {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Display-currency preference shared across the app.
 * Stored in localStorage; every consumer re-renders on change.
 */
export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getStoredCurrency, () => "USD" as CurrencyCode);

  const setCurrency = (code: CurrencyCode) => {
    window.localStorage.setItem(STORAGE_KEY, code);
    window.dispatchEvent(new Event(EVENT));
  };

  const format = (value: number) => formatMoney(value, currency);

  return { currency, setCurrency, format };
}
