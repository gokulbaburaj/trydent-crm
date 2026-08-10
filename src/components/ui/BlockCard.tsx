"use client";

import { ReactNode } from "react";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Salesforce/RonDesignLab deal card.
 *
 * Four things make that reference look like a product rather than an admin
 * panel, and none of them is the background colour — which is what the 8 Aug
 * palette flip got wrong on its own:
 *
 *   1. A large number anchoring the card. Not a label with a value beside it —
 *      the value IS the card, set big and bottom-left.
 *   2. Colour blocking. The fill is the identity, not a tint of a neutral. One
 *      or two blocked cards per group; the rest stay white so the blocks read
 *      as emphasis rather than decoration.
 *   3. Circular icon actions, top-right. Always the same two affordances in
 *      the same place, on every card.
 *   4. Overlapping avatars, bottom-right, balancing the number.
 *
 * `tone` is emphasis, not category. Every other palette in this app encodes
 * meaning (event hues, status colours); this one deliberately does not, so
 * don't map it to a status enum — that's how you end up with six unrelated
 * hues and no hierarchy.
 */
export type BlockTone = "plain" | "blue" | "yellow" | "teal" | "ink";

const TONES: Record<BlockTone, string> = {
  plain: "bg-card text-card-foreground border border-border",
  blue: "bg-block-blue text-block-blue-fg",
  yellow: "bg-block-yellow text-block-yellow-fg",
  teal: "bg-block-teal text-block-teal-fg",
  ink: "bg-block-ink text-block-ink-fg",
};

export function BlockCard({
  eyebrow,
  title,
  value,
  tone = "plain",
  avatars,
  onOpen,
  onMenu,
  className,
  children,
}: {
  /** Small quiet line above the title — a date, a stage, a category. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** The anchor. Set large; this is what the eye lands on. */
  value?: ReactNode;
  tone?: BlockTone;
  /** Rendered as an overlapping stack, bottom-right. */
  avatars?: ReactNode;
  onOpen?: () => void;
  onMenu?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const blocked = tone !== "plain";

  return (
    <div
      className={cn(
        "group/block relative flex min-h-[9.5rem] flex-col justify-between rounded-2xl p-4",
        "transition-[transform,box-shadow] duration-150",
        onOpen && "cursor-pointer active:scale-[0.995]",
        blocked ? "shadow-[var(--shadow-sm)]" : "shadow-xs",
        TONES[tone],
        className
      )}
      onClick={onOpen}
    >
      {/* Actions sit top-right on every card, so the eye learns one place. */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {onMenu && (
          <CircleAction
            blocked={blocked}
            label="More"
            onClick={(e) => {
              e.stopPropagation();
              onMenu();
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </CircleAction>
        )}
        {onOpen && (
          <CircleAction blocked={blocked} label="Open" solid onClick={(e) => e.stopPropagation()}>
            <ArrowUpRight className="h-4 w-4" />
          </CircleAction>
        )}
      </div>

      <div className="pr-16">
        {eyebrow && (
          <p className={cn("text-[11px]", blocked ? "opacity-70" : "text-muted-2")}>{eyebrow}</p>
        )}
        <p className="mt-1 text-[15px] font-medium leading-snug">{title}</p>
      </div>

      <div className="flex items-end justify-between gap-3">
        {value != null && (
          // The whole point of the card. Tabular so a column of them aligns.
          <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">
            {value}
          </p>
        )}
        {avatars && <div className="flex -space-x-2">{avatars}</div>}
      </div>

      {children}
    </div>
  );
}

/**
 * Circular action. On a blocked card it has to sit on a saturated fill, so it
 * borrows the card's own foreground at low alpha rather than a fixed neutral —
 * a grey ring disappears on blue and shouts on yellow.
 */
function CircleAction({
  children,
  label,
  blocked,
  solid,
  onClick,
}: {
  children: ReactNode;
  label: string;
  blocked: boolean;
  solid?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
        solid
          ? blocked
            ? "bg-current/15 text-current hover:bg-current/25"
            : "bg-foreground text-background hover:opacity-90"
          : blocked
            ? "border border-current/25 text-current hover:bg-current/10"
            : "border border-border text-muted-foreground hover:bg-hover hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
