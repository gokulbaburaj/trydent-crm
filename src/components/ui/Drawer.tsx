"use client";

import { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { cn } from "@/lib/utils";

/** shadcn/ui Sheet with our legacy Drawer API. */
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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "w-full gap-0 border-border bg-background p-0",
          wide ? "sm:max-w-3xl" : "sm:max-w-md"
        )}
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
