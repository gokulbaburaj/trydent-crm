"use client";

import { ReactNode } from "react";
import { HoverCard as HoverCardPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { releaseBodyPointerEvents } from "@/lib/radixBodyLock";

/**
 * Richer than a Tooltip, lighter than a Popover.
 *
 * `Tooltip` was the obvious candidate and is the wrong one: it's styled as an
 * inverted one-liner (`bg-foreground text-background`, `text-xs text-balance`)
 * with a hardcoded arrow. Putting a titled card with a client, attendees and an
 * agenda snippet inside it means fighting all of that. This shares the
 * Popover's surface instead, which is what a floating panel looks like here.
 *
 * Hover only, and deliberately not focusable-open: the trigger on the calendar
 * is a draggable button, and stealing focus interactions from it breaks the
 * drag. Keyboard users get the same content by opening the event.
 *
 * NOTE: this portals to <body>, which is correct HERE — the week grid is a
 * `max-h-[640px] overflow-y-auto` scroller and an in-flow card would be clipped
 * by it. Do NOT reuse this inside a Drawer without reading the TimePicker note;
 * a portalled floating element sits outside the modal's scroll lock and eats
 * wheel events.
 */
export function HoverCard({
  trigger,
  children,
  side = "right",
  align = "start",
  open,
  className,
  openDelay = 320,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Force closed — e.g. while the trigger is being dragged. */
  open?: false;
  className?: string;
  openDelay?: number;
}) {
  return (
    <HoverCardPrimitive.Root
      openDelay={openDelay}
      closeDelay={80}
      {...(open === false ? { open: false as const } : {})}
      onOpenChange={(next) => {
        // Same body-inert quirk the Popover works around. See lib/radixBodyLock.
        if (!next) releaseBodyPointerEvents();
      }}
    >
      <HoverCardPrimitive.Trigger asChild>{trigger}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-[130] w-64 rounded-lg border border-border bg-popover p-3 shadow-xl shadow-black/60",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            "data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1",
            "data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
            className
          )}
        >
          {children}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
