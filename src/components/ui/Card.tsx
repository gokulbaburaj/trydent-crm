import { HTMLAttributes } from "react";
import { Card as ShadCard } from "@/components/shadcn/card";
import { cn } from "@/lib/utils";

/** shadcn/ui Card, densified to our app's p-4 block layout. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadCard
      className={cn("block gap-0 p-4 transition-colors duration-200", className)}
      {...props}
    />
  );
}
