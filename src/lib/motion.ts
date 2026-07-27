"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";

/**
 * The app's anime.js layer.
 *
 * Deliberately small. Hover, press and entrance fades stay in CSS — those run
 * on the compositor and moving them to JS would cost frames rather than buy
 * them. anime.js is here for the things CSS genuinely can't do: interpolating
 * a *number* rather than a style, and staggering across a set.
 *
 * Imported from the subpath entries so the bundle only picks up Timer +
 * Animation (~11KB) rather than Draggable, Scroll and SVG too.
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

    const state = { n: from };
    const animation = animate(state, {
      n: value,
      duration: 700,
      ease: "out(3)",
      onUpdate: () => {
        current.current = state.n;
        el.textContent = formatRef.current(state.n);
      },
      onComplete: () => {
        current.current = value;
        el.textContent = formatRef.current(value);
      },
    });

    return () => {
      animation.pause();
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
