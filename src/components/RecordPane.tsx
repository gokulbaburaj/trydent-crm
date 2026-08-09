"use client";

import { cn } from "@/lib/utils";
import { WashPane, RoundButton } from "@/components/ui/Wash";
import { Check, Lock } from "lucide-react";

/**
 * The record pane — everything to the right of the queue.
 *
 * Composed of four bands, in this order, because that's the order the
 * questions get asked:
 *
 *   toolbar   what can I DO to this          (Save, New, Delete, …)
 *   identity  what IS this                   (avatar, name, chips, meta)
 *   stage     where is it in the process     (Qualify → Develop → …)
 *   tabs      which slice am I reading
 *   body      the panel grid
 *
 * The whole thing sits on ONE `WashPane`, so the gradient runs continuously
 * from the toolbar down through the panel grid. Wrapping each band in its own
 * washed container was the first attempt and it banded visibly at every seam —
 * the gradient restarted four times down the page.
 */
export function RecordPane({
  toolbar,
  identity,
  stage,
  tabs,
  children,
  className,
}: {
  toolbar?: React.ReactNode;
  identity: React.ReactNode;
  stage?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <WashPane className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* Toolbar and identity are pinned; only the body scrolls. Scrolling the
          name out of view in a two-column layout is disorienting in a way it
          isn't in a drawer, because the queue beside it stays put and you lose
          the only label saying which record the pane belongs to. */}
      {toolbar && (
        <div className="shrink-0 overflow-x-auto px-3 pt-3">
          <div className="flex items-center gap-1.5">{toolbar}</div>
        </div>
      )}

      <div className="shrink-0 px-4 pt-3">{identity}</div>

      {stage && <div className="shrink-0 px-4 pt-3">{stage}</div>}

      {tabs && (
        <div className="shrink-0 overflow-x-auto px-4 pt-3">
          <div className="flex items-center gap-1.5">{tabs}</div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </WashPane>
  );
}

/**
 * A toolbar action. Text beside the icon, not a bare icon.
 *
 * The reference labels every one of these, and it's right to: Save / New /
 * Delete / Refresh / Check Access / To PDF are not a set anyone decodes from
 * glyphs. The circular icon-only buttons in that design are reserved for
 * things you don't need to find — overflow, expand, refresh a single card.
 */
export function ToolbarButton({
  icon: Icon,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3",
        "text-[13px] font-medium text-foreground-secondary",
        "transition-colors hover:bg-[var(--wash-card)] hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}

/** A label/value pair in the identity band. */
export function MetaPair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-[13px] font-medium text-foreground">{children}</div>
    </div>
  );
}

/**
 * The tab row. Active tab is black — the same ink used for primary actions.
 *
 * Deliberately reusing ink rather than giving tabs their own accent: in the
 * reference, black consistently means "the thing you're on or the thing you'd
 * press", and adding a fifth colour system for tabs would break the rule that
 * makes the other four legible.
 */
export function PaneTab({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      className={cn(
        "min-h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-foreground-secondary hover:bg-[var(--wash-card)]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface Stage {
  id: string;
  label: string;
  /** Shown under the label on the active step, e.g. "3 D" or a due date. */
  hint?: string;
}

/**
 * Stage stepper — Qualify → Develop → Propose → Close.
 *
 * Three states, and the distinction matters: DONE steps are behind you and
 * clickable to review, the CURRENT step is filled with `--primary` (this is
 * the process accent's job, per the note in globals.css), and FUTURE steps are
 * locked. The padlock is from the reference and it earns its place — a greyed
 * step reads as disabled-because-broken, whereas a lock reads as
 * not-yet-reached, which is what it is.
 *
 * `onSelect` is optional. Without it the stepper is a read-only progress
 * indicator, which is the right default: letting someone click a deal straight
 * to "Close" from a progress bar is how pipelines get corrupted.
 */
export function StageStepper({
  stages,
  currentId,
  onSelect,
  className,
}: {
  stages: Stage[];
  currentId: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const currentIndex = stages.findIndex((s) => s.id === currentId);

  return (
    <div
      className={cn(
        "flex items-stretch gap-1 overflow-x-auto rounded-full p-1",
        "border border-[var(--wash-edge)] bg-[var(--wash-card)]",
        className
      )}
      role="list"
      aria-label="Progress"
    >
      {stages.map((stage, i) => {
        const done = currentIndex > -1 && i < currentIndex;
        const current = i === currentIndex;
        const locked = currentIndex > -1 && i > currentIndex;
        const interactive = !!onSelect && !locked;

        return (
          <button
            key={stage.id}
            role="listitem"
            disabled={!interactive}
            onClick={interactive ? () => onSelect(stage.id) : undefined}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex min-h-9 shrink-0 items-center gap-2 rounded-full px-3.5 transition-colors",
              current && "bg-primary text-primary-foreground",
              done && "text-foreground-secondary",
              locked && "text-muted-2",
              interactive && !current && "hover:bg-[var(--wash-card-strong)]",
              !interactive && "cursor-default"
            )}
          >
            <span className="shrink-0">
              {done && <Check className="h-3.5 w-3.5" />}
              {locked && <Lock className="h-3.5 w-3.5" />}
              {current && (
                <span className="block h-2 w-2 rounded-full bg-primary-foreground" />
              )}
            </span>
            <span className="whitespace-nowrap text-[13px] font-medium">
              {stage.label}
              {stage.hint && current && (
                <span className="ml-1.5 opacity-70">{stage.hint}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel grid.
 *
 * Three columns at `xl`, two at `lg`, one below. `auto-rows-min` so a short
 * panel doesn't stretch to match a tall neighbour — the reference's Contact
 * card and Lead Score card are visibly different heights and that irregularity
 * is what stops the grid reading as a table.
 */
export function PanelGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid auto-rows-min grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Panel header: title on the left, small round actions on the right. */
export function PanelHeader({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
        {title}
      </h3>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export { RoundButton };
