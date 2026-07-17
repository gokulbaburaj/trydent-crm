"use client";

import { ReactNode } from "react";
import {
  Tooltip as Root,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";

export { TooltipProvider } from "@/components/shadcn/tooltip";

/** One-liner shadcn tooltip: <Tip label="Close">…</Tip> */
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
      <TooltipContent side={side}>{label}</TooltipContent>
    </Root>
  );
}
