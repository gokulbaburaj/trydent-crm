"use client";

import NumberFlow from "@number-flow/react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/types";

/**
 * A currency figure whose digits transition when the amount changes.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `@number-flow/react` has been in package.json since the charts were added and
 * was used only inside the vendored `charts/` directory. Every money figure we
 * wrote by hand — deal value, collected, outstanding, invoice totals — was a
 * string that hard-swapped. Switching display currency from USD to INR
 * teleported every number on screen with nothing connecting the before and
 * after, which is the exact "animating a number by re-rendering text" mismatch.
 *
 * ── The part that needs care ────────────────────────────────────────────────
 *
 * Rolling digits are only correct when the SAME figure changes value. They are
 * wrong when you're looking at a different record: clicking through a queue of
 * deals would set every number spinning on each click, and list navigation is a
 * tens-per-day action where motion reads as lag.
 *
 * That distinction isn't handled here — it's handled by keying the record pane
 * on the record id. A remount paints the new value immediately (NumberFlow has
 * no previous value to animate from), while a value change inside a mount
 * animates. So selection is instant and a currency switch rolls, from one
 * mechanism, with no `shouldAnimate` prop to get wrong at a call site.
 *
 * If you use <Money> outside a keyed container, check that the number can't
 * change identity underneath it.
 */
export function Money({
  value,
  from,
  className,
  animate = true,
}: {
  value: number;
  /** The currency the amount is STORED in. Defaults to the workspace base. */
  from?: CurrencyCode;
  className?: string;
  /**
   * Escape hatch for dense lists. A queue of twenty rows all animating at once
   * is noise, and each row is its own record anyway — nothing there is "the
   * same number changing".
   */
  animate?: boolean;
}) {
  const { resolve, format } = useCurrency();
  const { amount, currency } = resolve(Number(value) || 0, from);

  if (!animate) {
    return <span className={cn("tabular-nums", className)}>{format(Number(value) || 0, from)}</span>;
  }

  return (
    <NumberFlow
      className={cn("tabular-nums", className)}
      value={amount}
      /*
        Locale mirrors formatMoney in lib/fx.ts — INR groups differently
        (1,20,000 not 120,000), and a digit animation that regroups halfway
        through looks broken. Same rule in both places or they disagree.
      */
      locales={currency === "INR" ? "en-IN" : "en-US"}
      format={{
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }}
      /*
        Respects prefers-reduced-motion natively — NumberFlow falls back to a
        plain value swap rather than needing a media query here.
      */
      transformTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      spinTiming={{ duration: 400, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      opacityTiming={{ duration: 200, easing: "ease-out" }}
    />
  );
}
