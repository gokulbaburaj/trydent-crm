"use client";

import { useEffect, useSyncExternalStore } from "react";

export interface AccentPreset {
  name: string;
  primary: string;
  foreground: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { name: "Linear Indigo", primary: "#5e6ad2", foreground: "#ffffff" },
  { name: "Purple", primary: "#a855f7", foreground: "#ffffff" },
  { name: "Blue", primary: "#4ea7e0", foreground: "#08090a" },
  { name: "Green", primary: "#4cb782", foreground: "#052e12" },
  { name: "Orange", primary: "#f2994a", foreground: "#2e1a05" },
  { name: "Pink", primary: "#d95c8a", foreground: "#ffffff" },
  { name: "Red", primary: "#eb5757", foreground: "#ffffff" },
];

const STORAGE_KEY = "trydent-primary";
const EVENT = "trydent-primary-change";

function isHex(v: string) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/** Perceived brightness, 0–255. */
export function luminanceOf(hex: string) {
  if (!isHex(hex)) return 0;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * The accent drives every chart series, progress bar and highlight. On this
 * dark shell a near-white accent makes charts read as blank blocks and a
 * near-black one makes them vanish — both look like the app is broken rather
 * than like a colour choice. Settings warns rather than blocks: it's your app.
 */
export function accentIsRisky(hex: string) {
  const l = luminanceOf(hex);
  return l > 225 || l < 40;
}

/** Best foreground (dark or white) for a given primary, by luminance. */
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
  const apply = () => {
    const root = document.documentElement;
    root.style.setProperty("--primary", hex);
    root.style.setProperty("--primary-foreground", foregroundFor(hex));
  };
  // Cross-fade the whole UI to the new color when supported.
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(apply);
  } else {
    apply();
  }
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
  const primary = useSyncExternalStore(subscribe, getStoredAccent, () => "#5e6ad2");
  return { primary, setAccent };
}

/** Mount once in the root layout — applies the saved primary on load. */
export function ThemeLoader() {
  useEffect(() => {
    applyAccent(getStoredAccent());
  }, []);
  return null;
}
