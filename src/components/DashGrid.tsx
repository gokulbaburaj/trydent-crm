"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/format";
import { canMove, moveInOrder } from "@/lib/reorder";

export interface DashCardDef {
  id: string;
  defaultSpan: number; // 1..3 columns on large screens
  render: () => ReactNode;
}

interface SavedLayout {
  order: string[];
  spans: Record<string, number>;
}

/**
 * Dashboard grid with user-arrangeable cards:
 * — grip handle (top-left, on hover) drags a card onto another to reorder
 * — corner handle (bottom-right) drags to resize the column span (1–3)
 * Layout persists per storageKey in localStorage.
 */
export function DashGrid({ storageKey, cards }: { storageKey: string; cards: DashCardDef[] }) {
  const ids = cards.map((c) => c.id);
  const [order, setOrder] = useState<string[]>(ids);
  const [spans, setSpans] = useState<Record<string, number>>(
    Object.fromEntries(cards.map((c) => [c.id, c.defaultSpan]))
  );
  const [isLg, setIsLg] = useState(false);
  const loaded = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsLg(mq.matches);
    queueMicrotask(() => {
      apply();
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(storageKey) ?? "null"
        ) as SavedLayout | null;
        if (saved?.order) {
          setOrder([
            ...saved.order.filter((id) => ids.includes(id)),
            ...ids.filter((id) => !saved.order.includes(id)),
          ]);
        }
        if (saved?.spans) setSpans((s) => ({ ...s, ...saved.spans }));
      } catch {
        // corrupt layout — fall back to defaults
      }
      loaded.current = true;
    });
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ order, spans }));
  }, [order, spans, storageKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // View transition makes the cards morph to their new spots.
    withViewTransition(() => {
      setOrder((prev) => {
        const next = prev.filter((id) => id !== active.id);
        const idx = next.indexOf(String(over.id));
        next.splice(idx === -1 ? next.length : idx, 0, String(active.id));
        return next;
      });
    });
  }

  /*
    The keyboard path to rearranging. Same state and the same view transition
    as a drag, so the two can't drift apart.

    `moveInOrder` returns the SAME array when nothing can move, so setOrder
    bails out of the update rather than firing a transition for a no-op.
  */
  function moveCard(id: string, direction: -1 | 1) {
    withViewTransition(() => {
      setOrder((prev) => moveInOrder(prev, id, direction));
    });
  }

  function resizeTo(id: string, startSpan: number, startX: number, clientX: number) {
    const grid = gridRef.current;
    if (!grid) return;
    const colWidth = grid.getBoundingClientRect().width / 3;
    const next = Math.min(3, Math.max(1, startSpan + Math.round((clientX - startX) / colWidth)));
    setSpans((s) => (s[id] === next ? s : { ...s, [id]: next }));
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/*
        Rows size to their content, but each cell is capped (see DashCell's
        max-height). So a row of short cards stays short instead of leaving a
        band of dead space, and a card with twenty tasks stops at the ceiling
        and scrolls rather than pushing the page down. Fixed rows solved the
        second problem and caused the first.
      */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3"
      >
        {order.map((id) => {
          const def = cards.find((c) => c.id === id);
          if (!def) return null;
          return (
            <DashCell
              key={id}
              id={id}
              span={isLg ? (spans[id] ?? def.defaultSpan) : 1}
              resizable={isLg}
              onResize={(startSpan, startX, clientX) => resizeTo(id, startSpan, startX, clientX)}
              onMove={(direction) => moveCard(id, direction)}
              canMoveBack={canMove(order, id, -1)}
              canMoveForward={canMove(order, id, 1)}
            >
              {def.render()}
            </DashCell>
          );
        })}
      </div>
    </DndContext>
  );
}

function DashCell({
  id,
  span,
  resizable,
  onResize,
  onMove,
  canMoveBack,
  canMoveForward,
  children,
}: {
  id: string;
  span: number;
  resizable: boolean;
  onResize: (startSpan: number, startX: number, clientX: number) => void;
  /** Move one place. The keyboard path — see lib/reorder.ts for why. */
  onMove: (direction: -1 | 1) => void;
  canMoveBack: boolean;
  canMoveForward: boolean;
  children: ReactNode;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id });
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({ id });
  const [resizing, setResizing] = useState(false);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX;
    const startSpan = span;
    const move = (ev: PointerEvent) => onResize(startSpan, startX, ev.clientX);
    const up = () => {
      setResizing(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={dropRef}
      style={
        {
          gridColumn: span > 1 ? `span ${span} / span ${span}` : undefined,
          viewTransitionName: `dash-${id}`,
        } as React.CSSProperties
      }
      className={cn(
        // The ceiling lives here rather than on the grid row: the row sizes to
        // the tallest cell, and every cell is capped, so a row can be short but
        // never runaway-tall.
        "group/dash relative h-full max-h-[22rem] rounded-md transition-[box-shadow,opacity] duration-150",
        (isOver || resizing) && "ring-1 ring-primary/60",
        isDragging && "opacity-40"
      )}
    >
      {/* The card is wrapped so `h-full` reaches it without also stretching the
          drag and resize handles below — a `[&>*]` selector caught those too
          and rendered the grip as a full-height bar. */}
      <div className="h-full [&>*]:h-full">{children}</div>

      {/*
        Rearrange cluster: drag handle plus two move-one-place buttons.

        `group-focus-within/dash:opacity-100` is the half that matters. The
        cluster was hover-only, so even once the buttons existed a keyboard
        user would Tab to something invisible. Revealed on focus as well as
        hover, it's reachable without a pointer.

        The buttons sit here rather than somewhere new because this is already
        where the hand goes to rearrange — a second control cluster elsewhere
        would be two places to look for one job.
      */}
      {/*
        Always visible, just quiet — NOT hidden until hover.

        Three attempts at revealing it on focus all failed in the browser:
        `group-focus-within/dash:`, a plain `focus-within:`, and React state
        with onFocusCapture. In every case focus was demonstrably inside the
        cluster and the opacity stayed at 0. I could not explain why, and
        shipping a control that a keyboard user can tab to but cannot see is
        worse than having no control at all.

        So: no reveal mechanism to get wrong. 55% opacity keeps it out of the
        way while the card is being read, full opacity on hover or focus. The
        cost is a permanently visible chrome cluster on each card, which is a
        real design cost — but a knowable one, rather than an accessibility
        hole that only shows up when someone tries to use it.
      */}
      <div className="absolute left-1 top-1 z-10 flex items-center gap-0.5 opacity-55 transition-opacity hover:opacity-100 [&:has(:focus-visible)]:opacity-100">
        <button
          ref={dragRef}
          {...listeners}
          {...attributes}
          title="Drag to rearrange"
          className="cursor-grab rounded-md bg-surface/80 p-1 text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-active hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canMoveBack}
          aria-label="Move card earlier"
          title="Move earlier"
          className="rounded-md bg-surface/80 p-1 text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-active hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canMoveForward}
          aria-label="Move card later"
          title="Move later"
          className="rounded-md bg-surface/80 p-1 text-muted-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-active hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Corner resize handle */}
      {resizable && (
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute bottom-1 right-1 z-10 h-3.5 w-3.5 cursor-se-resize rounded-br border-b-2 border-r-2 border-muted-2 opacity-0 transition-opacity hover:border-primary group-hover/dash:opacity-100"
        />
      )}
    </div>
  );
}
