import { HTMLAttributes } from "react";
import { Card as ShadCard } from "@/components/shadcn/card";
import { cn } from "@/lib/utils";

/** shadcn/ui Card, densified to our app's p-4 block layout. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadCard
      // p-3.5 not p-4: the reference runs noticeably tighter, and with the
      // deeper surface ramp the card no longer needs padding to separate
      // itself from what's behind it.
      className={cn("block gap-0 p-3.5 transition-colors duration-200", className)}
      {...props}
    />
  );
}
