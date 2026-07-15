"use client";

import { ReactNode, useState } from "react";
import { Check } from "lucide-react";
import {
  Popover as ShadPopover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";

/**
 * Radix-powered popover (via shadcn/ui) with our legacy render-prop API.
 * Positioning, portaling, collision handling, and nesting inside sheets
 * are all handled by Radix.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  className,
  fullWidth = false,
}: {
  trigger: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  className?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <ShadPopover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          onClick={(e) => e.stopPropagation()}
          className={fullWidth ? "block w-full" : "inline-block"}
        >
          {trigger}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align={align === "right" ? "end" : "start"}
        sideOffset={4}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "min-w-[190px] w-auto rounded-lg border-border bg-popover p-1 shadow-xl shadow-black/60",
          fullWidth && "w-[var(--radix-popover-trigger-width)]",
          className
        )}
      >
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </ShadPopover>
  );
}

export function MenuItem({
  onClick,
  selected,
  icon,
  children,
  danger,
}: {
  onClick?: () => void;
  selected?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
      )}
    >
      {icon && <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="mx-1 my-1 border-t border-border-subtle" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">{children}</div>;
}
