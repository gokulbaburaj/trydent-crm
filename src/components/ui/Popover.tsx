"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Linear-style popover: dark elevated panel, 6px radius, soft shadow.
 * Rendered through a portal so it never gets clipped by scroll containers.
 * Trigger click toggles; outside click / Escape / scroll closes.
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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(
      align === "right"
        ? { top: rect.bottom + 4, right: window.innerWidth - rect.right }
        : { top: rect.bottom + 4, left: rect.left }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      <div
        ref={triggerRef}
        className={fullWidth ? "block w-full" : "inline-block"}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {trigger}
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right, zIndex: 100 }}
            className={cn(
              "animate-pop min-w-[190px] rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/60",
              align === "right" ? "origin-top-right" : "origin-top-left",
              className
            )}
          >
            {typeof children === "function" ? children(() => setOpen(false)) : children}
          </div>,
          document.body
        )}
    </>
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
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors",
        danger
          ? "text-danger hover:bg-danger/10"
          : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
      )}
    >
      {icon && <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-muted" />}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="mx-1 my-1 border-t border-border-subtle" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted">{children}</div>;
}
