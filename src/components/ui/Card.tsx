import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-surface border border-border p-4 shadow-sm shadow-black/20 transition-colors duration-200",
        className
      )}
      {...props}
    />
  );
}
