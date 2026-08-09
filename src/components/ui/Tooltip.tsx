"use client";

import { ReactNode } from "react";
import {
  Tooltip as Root,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";

export { TooltipProvider } from "@/components/shadcn/tooltip";

/**
 * One-liner shadcn tooltip: <Tip label="Close">…</Tip>
 *
 * ── Why the instant path exists ─────────────────────────────────────────────
 *
 * The 350ms delay on the provider is there to stop tooltips firing every time
 * the cursor crosses a button on its way somewhere else. That's right for the
 * FIRST tooltip and wrong for every one after it: once you've hovered one icon
 * in a toolbar, you've declared you're reading labels, and making you wait
 * another 350ms plus a 150ms animation for each neighbour is what makes an
 * icon toolbar feel slow.
 *
 * Radix already skips the DELAY within `skipDelayDuration` of closing one.
 * What it doesn't skip is the animation — so the second tooltip still fades
 * and zooms in. `data-instant` removes that too, which is the half most
 * implementations miss.
 *
 * Detected from Radix's own state rather than tracked here: the provider sets
 * `data-state="instant-open"` on content that opened inside the skip window.
 */
export function Tip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Root>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className="data-[state=instant-open]:animate-none data-[state=instant-open]:duration-0"
      >
        {label}
      </TooltipContent>
    </Root>
  );
}
