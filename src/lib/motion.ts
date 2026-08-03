"use client";

import { useEffect, useRef } from "react";
import { animate } from "motion/react";

/**
 * The app's imperative animation layer.
 *
 * Deliberately small. Hover, press and entrance fades stay in CSS — those run
 * on the compositor and moving them to JS would cost frames rather than buy
 * them. This exists for the one thing CSS genuinely can't do: interpolating a
 * *number* rather than a style.
 *
 * Uses `motion`, which the app already depends on in 44 other places. This was
 * anime.js until 2026-08-03 — two animation libraries for one call site was
 * not worth the bytes. Two things differ between them and both are silent if
 * you get them wrong: motion measures duration in SECONDS where anime.js used
 * milliseconds, and anime's `out(3)` easing has no built-in equivalent here,
 * so the curve is written out below rather than approximated with `easeOut`.
 */

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Count a number up to its value when it first appears, and tween between
 * values when it changes.
 *
 * Writes straight to `textContent` through a ref instead of going through
 * state. A 60fps setState would re-render the whole page sixty times a second
 * to move one label; this touches exactly one text node.
 *
 * @param value  the target number
 * @param format how to render it at each frame (currency, percent, plain)
 */
export function useCountUp(
  value: number,
  format: (n: number) => string = (n) => String(Math.round(n))
) {
  const ref = useRef<HTMLSpanElement>(null);
  // Where the last animation finished, so a changed value tweens from there
  // rather than restarting from zero.
  const current = useRef(0);
  // format changes identity every render when written inline; keep it in a ref
  // so it can't restart the animation. Synced in an effect rather than during
  // render — writing to a ref while rendering isn't safe under concurrent
  // React, and the lint config rightly rejects it. Effects run in declaration
  // order, so this lands before the animation below reads it.
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      current.current = value;
      el.textContent = formatRef.current(value);
      return;
    }

    const from = current.current;
    if (from === value) {
      el.textContent = formatRef.current(value);
      return;
    }

    const animation = animate(from, value, {
      duration: 0.7, // seconds — this was 700 under anime.js
      // anime.js `out(3)`: 1 - (1 - t)^3. Motion's "easeOut" is a shallower
      // curve, so the counter would decelerate visibly differently.
      ease: (t) => 1 - Math.pow(1 - t, 3),
      onUpdate: (n) => {
        current.current = n;
        el.textContent = formatRef.current(n);
      },
      onComplete: () => {
        current.current = value;
        el.textContent = formatRef.current(value);
      },
    });

    return () => {
      animation.stop();
    };
  }, [value]);

  return ref;
}

/**
 * Inline style carrying a stagger delay for `.animate-row`.
 *
 * Capped deliberately: an uncapped `index * step` means the fortieth row of a
 * long list appears two seconds late, which reads as lag rather than polish.
 */
export function staggerDelay(index: number, step = 28, max = 320) {
  return { animationDelay: `${Math.min(index * step, max)}ms` };
}
