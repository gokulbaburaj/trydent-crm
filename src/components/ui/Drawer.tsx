"use client";

import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { cn } from "@/lib/utils";

/**
 * Centred modal.
 *
 * Still called Drawer because dozens of call sites import it under that name
 * and the props are unchanged — only the presentation moved from a right-hand
 * sheet to a centred dialog. Renaming the file would be a large, purely
 * cosmetic diff for no behavioural gain.
 *
 * The header stays fixed while the body scrolls, so a long form (task details,
 * portal panel) keeps its title in view. Height is capped at 85vh so the modal
 * never runs off a laptop screen.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          // Phones get more of the screen and tighter gutters — a 2rem inset
          // plus 1.5rem of padding each side left forms squeezed into ~250px.
          "flex max-h-[90vh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden border-border bg-background p-0 sm:max-h-[85vh] sm:w-full",
          wide ? "sm:max-w-4xl" : "sm:max-w-xl"
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="pr-6 text-[15px] font-semibold text-foreground">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
