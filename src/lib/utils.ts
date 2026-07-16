import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Run a state update inside a View Transition when the browser supports it —
 * elements with a `view-transition-name` morph smoothly to their new position
 * instead of jumping. Falls back to an instant update.
 */
export function withViewTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof doc.startViewTransition === "function" && !reduced) {
    doc.startViewTransition(update);
  } else {
    update();
  }
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
