"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface AccentPreset {
  name: string;
  accent: string;
  foreground: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "Linear Indigo", accent: "#5e6ad2", foreground: "#ffffff" },
  { name: "Purple", accent: "#a855f7", foreground: "#ffffff" },
  { name: "Blue", accent: "#4ea7e0", foreground: "#08090a" },
  { name: "Green", accent: "#4cb782", foreground: "#052e12" },
  { name: "Orange", accent: "#f2994a", foreground: "#2e1a05" },
  { name: "Pink", accent: "#d95c8a", foreground: "#ffffff" },
  { name: "Red", accent: "#eb5757", foreground: "#ffffff" },
];

const STORAGE_KEY = "trydent-accent";
const EVENT = "trydent-accent-change";

function isHex(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Best foreground (dark or white) for a given accent, by luminance. */
export function foregroundFor(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 160 ? "#08090a" : "#ffffff";
}

export function getStoredAccent(): string {
  if (typeof window === "undefined") return "#5e6ad2";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && isHex(v) ? v : "#5e6ad2";
}

export function applyAccent(hex: string) {
  if (!isHex(hex)) return;
  const root = document.documentElement;
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-foreground", foregroundFor(hex));
}

export function setAccent(hex: string) {
  if (!isHex(hex)) return;
  window.localStorage.setItem(STORAGE_KEY, hex);
  applyAccent(hex);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useAccent() {
  const accent = useSyncExternalStore(subscribe, getStoredAccent, () => "#5e6ad2");
  return { accent, setAccent };
}

/** Mount once in the root layout — applies the saved accent on load. */
export function ThemeLoader() {
  useEffect(() => {
    applyAccent(getStoredAccent());
  }, []);
  return null;
}
