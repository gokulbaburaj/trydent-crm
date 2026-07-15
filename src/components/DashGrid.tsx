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
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

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
    setOrder((prev) => {
      const next = prev.filter((id) => id !== active.id);
      const idx = next.indexOf(String(over.id));
      next.splice(idx === -1 ? next.length : idx, 0, String(active.id));
      return next;
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
      <div ref={gridRef} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
  children,
}: {
  id: string;
  span: number;
  resizable: boolean;
  onResize: (startSpan: number, startX: number, clientX: number) => void;
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
      style={{ gridColumn: span > 1 ? `span ${span} / span ${span}` : undefined }}
      className={cn(
        "group/dash relative rounded-md transition-[box-shadow,opacity] duration-150",
        (isOver || resizing) && "ring-1 ring-accent/60",
        isDragging && "opacity-40"
      )}
    >
      {children}

      {/* Drag-to-rearrange handle */}
      <button
        ref={dragRef}
        {...listeners}
        {...attributes}
        title="Drag to rearrange"
        className="absolute left-1 top-1 z-10 cursor-grab rounded bg-surface/80 p-1 text-muted opacity-0 shadow-sm transition-opacity hover:bg-white/10 hover:text-foreground active:cursor-grabbing group-hover/dash:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Corner resize handle */}
      {resizable && (
        <div
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute bottom-1 right-1 z-10 h-3.5 w-3.5 cursor-se-resize rounded-br border-b-2 border-r-2 border-muted-2 opacity-0 transition-opacity hover:border-accent group-hover/dash:opacity-100"
        />
      )}
    </div>
  );
}
