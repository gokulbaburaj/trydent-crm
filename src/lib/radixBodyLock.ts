"use client";

/**
 * Undo Radix's body pointer-events lock after a floating layer closes.
 *
 * ── The bug ──────────────────────────────────────────────────────────────
 * Radix's modal layers (Select is always modal — @radix-ui/react-select 2.3.x
 * has no `modal` prop — and Popover/DropdownMenu are modal when asked) set
 * `pointer-events: none` on <body> while open, so clicks can't reach the page
 * behind them. They clear it on close, but not before the browser dispatches
 * the click that follows. That click lands on an inert body and goes nowhere.
 *
 * Symptom: after touching any dropdown, the NEXT click anywhere does nothing
 * and you have to click twice. On the Accounts page it reads as "the section
 * opens but won't close" — the closing click is being eaten, so nothing looks
 * broken, it just feels dead.
 *
 * ── Why the first fix wasn't enough ──────────────────────────────────────
 * It lived inside Dropdown and ran exactly one requestAnimationFrame after
 * close. Two problems:
 *
 *   1. One frame is a race. The layer stays mounted through its exit
 *      animation (~150ms), and Radix restores the style on unmount. Clearing
 *      once at ~16ms usually wins, but if the tab is busy the eaten click
 *      happens first. Retrying across a short window costs nothing and closes
 *      the gap.
 *   2. It only covered Select. Popover has the same lock and never got the
 *      treatment, so every menu built on it kept the bug.
 *
 * ── The guard ────────────────────────────────────────────────────────────
 * We refuse to clear while a real dialog is open, because our Drawer sets the
 * same property on purpose. Clearing it under an open modal would let clicks
 * pass through the overlay to the page behind — a worse bug than the one
 * being fixed. Radix Select content is `role="listbox"` and Popover content is
 * `role="dialog"` but without `data-state="open"` once closing, so the check
 * below is specific enough to distinguish them from a Drawer.
 */

/** Frames to keep trying. ~6 frames ≈ 100ms, comfortably past the exit animation. */
const RETRY_FRAMES = 6;

function aModalIsStillOpen(): boolean {
  // Our Drawer renders a Radix Dialog, which is the only thing entitled to
  // hold the lock once the floating layer has gone.
  return !!document.querySelector('[role="alertdialog"][data-state="open"], [data-slot="dialog-content"][data-state="open"]');
}

export function releaseBodyPointerEvents() {
  if (typeof document === "undefined") return;

  let frames = 0;
  const tick = () => {
    if (aModalIsStillOpen()) return; // a Drawer owns the lock now; leave it alone
    if (document.body.style.pointerEvents === "none") {
      document.body.style.pointerEvents = "";
    }
    if (++frames < RETRY_FRAMES) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
