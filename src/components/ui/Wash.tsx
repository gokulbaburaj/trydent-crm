"use client";

import { cn } from "@/lib/utils";
import { heatOf, heatStyle, type HeatStep } from "@/lib/heat";

/**
 * The wash — one gradient, many translucent windows onto it.
 *
 * ── Why this is a layout primitive and not a class ──────────────────────────
 *
 * The obvious implementation is to give each card its own pale background and
 * call it a day. That produces a fruit salad, and it took a second look at the
 * reference to see why: in the original, hue tracks POSITION. The top-left
 * card reads lime and the bottom-right reads rose because they are windows
 * onto a single gradient that spans the whole pane, not because anyone painted
 * them. Move a card and its colour changes. That relationship is the effect.
 *
 * So `WashPane` owns the gradient (`--wash`, fixed at the pane's own size) and
 * `WashCard` is translucent white on top of it. The gradient is painted on the
 * pane's background, and every card is a frosted panel — nothing re-declares
 * the gradient, which is what keeps it continuous across the gaps between
 * cards.
 *
 * Consequence worth knowing: a WashCard rendered outside a WashPane is plain
 * translucent white on whatever is behind it. That degrades quietly rather
 * than breaking, which is the right failure — but it also won't look like
 * anything, so don't reach for WashCard as a general card. Use Card.
 */
export function WashPane({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative isolate min-h-0 overflow-hidden rounded-[var(--radius)]",
        className
      )}
      style={{ background: "var(--wash)" }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A frosted window onto the pane's gradient.
 *
 * `strong` raises the opacity for cards carrying dense body text — the rose
 * corner is the darkest part of the wash and long paragraphs there sit close
 * to the contrast floor at the default 62%. Headline cards and stat cards stay
 * on the default so the gradient reads through them.
 *
 * No border colour token here: `--border` is black-alpha, which over a
 * saturated wash reads as dirt. `--wash-edge` is white-alpha, so the edge
 * catches light the way the reference's does.
 */
export function WashCard({
  strong = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)-0.25rem)] p-4 backdrop-blur-[2px]",
        "border border-[var(--wash-edge)]",
        className
      )}
      style={{
        background: strong ? "var(--wash-card-strong)" : "var(--wash-card)",
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A value rendered as colour.
 *
 * Takes the raw number, not a step, on purpose — the bucketing has to happen
 * in one place or two call sites will disagree about what 88 means. Pass
 * `step` directly only when the value isn't a 0..100 score and you've already
 * normalised it with `heatInRange`.
 *
 * `null` renders nothing at all. An unknown score is not a cold one, and a
 * rose chip on a record nobody has scored yet reads as a judgement the data
 * doesn't support.
 */
export function HeatChip({
  value,
  step,
  label,
  className,
}: {
  value?: number | null;
  step?: HeatStep;
  label?: string;
  className?: string;
}) {
  if (step == null && (value == null || !Number.isFinite(value))) return null;
  const resolved = step ?? heatOf(value);

  return (
    <span
      className={cn(
        "inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1",
        "text-[12px] font-semibold leading-none tabular-nums",
        className
      )}
      style={heatStyle(resolved)}
      title={label}
    >
      {label ?? Math.round(value ?? 0)}
    </span>
  );
}

/**
 * The black pill. Primary actions only.
 *
 * Split out rather than added as a Button variant because the constraint is
 * the point: in the reference exactly one control per view is black, and a
 * variant sitting in the same list as `default`/`ghost`/`outline` invites
 * someone to use three of them on one screen. Having to import a
 * differently-named component is a small speed bump in the right direction.
 */
export function InkButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4",
        "min-h-9 text-[13px] font-medium",
        "bg-foreground text-background transition-opacity",
        "hover:opacity-85 active:opacity-70",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The secondary pill that sits beside an InkButton.
 *
 * Uses `--wash-line` (black hairline), NOT `--wash-edge` (white). A control
 * placed on top of a wash card is white-on-near-white with the white edge, and
 * that shipped: "Mark complete" rendered as bare text with no button around
 * it. The white edge is for where a card meets the gradient; anything sitting
 * on a card needs the dark one.
 */
export function GhostPill({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4",
        "min-h-9 text-[13px] font-medium",
        "border border-[var(--wash-line)] bg-transparent text-foreground",
        // Press feedback, matching the InkButton it sits beside. 0.97 and
        // 160ms are the standard subtle-press values; anything deeper reads
        // as a bounce on a control this size.
        "transition-[background-color,transform] duration-[160ms] ease-out",
        "hover:bg-[var(--wash-card-strong)] active:scale-[0.97]",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The small circular icon button that appears all over the reference —
 * toolbar, card corners, topbar.
 *
 * 36px, which is under the 44px touch floor, so it is `hidden` below `sm` at
 * every call site that matters. Kept at 36 because the reference's density
 * depends on it and a 44px circle in a card corner looks like a mistake; the
 * mobile layouts expose these actions as list rows instead.
 */
export function RoundButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "border border-[var(--wash-line)] bg-[var(--wash-card)]",
        "text-foreground-secondary transition-colors",
        "hover:bg-[var(--wash-card-strong)] hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
