"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export interface KanbanColumn {
  id: string;
  label: string;
}

export function KanbanBoard<T extends { id: string }>({
  columns,
  items,
  getColumnId,
  onMove,
  renderCard,
  renderColumnFooter,
  columnClassName,
  columnMeta,
}: {
  columns: KanbanColumn[];
  items: T[];
  getColumnId: (item: T) => string;
  onMove: (item: T, columnId: string) => void;
  renderCard: (item: T) => ReactNode;
  renderColumnFooter?: (columnId: string, items: T[]) => ReactNode;
  columnClassName?: string;
  columnMeta?: (columnId: string, items: T[]) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const item = items.find((i) => i.id === active.id);
    if (!item) return;
    const targetColumn = String(over.id);
    if (getColumnId(item) !== targetColumn) {
      onMove(item, targetColumn);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colItems = items.filter((i) => getColumnId(i) === col.id);
          return (
            <KanbanColumnDroppable key={col.id} id={col.id} className={columnClassName}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {col.label}
                </h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  {columnMeta?.(col.id, colItems)}
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted">
                    {colItems.length}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                {colItems.map((item) => (
                  <KanbanCardDraggable key={item.id} id={item.id}>
                    {renderCard(item)}
                  </KanbanCardDraggable>
                ))}
              </div>
              {renderColumnFooter?.(col.id, colItems)}
            </KanbanColumnDroppable>
          );
        })}
      </div>

      {/* Floating clone while dragging — portaled to <body> so page transforms
          and overflow clipping can never strand or offset it. */}
      <BodyPortal>
        <DragOverlay
          dropAnimation={{ duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {activeItem ? (
            <div className="rotate-2 scale-[1.03] cursor-grabbing rounded border border-accent/50 bg-surface p-3 shadow-2xl shadow-black/60">
              {renderCard(activeItem)}
            </div>
          ) : null}
        </DragOverlay>
      </BodyPortal>
    </DndContext>
  );
}

function BodyPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function KanbanColumnDroppable({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 shrink-0 rounded-md border border-border bg-white/[0.02] p-3 transition-colors",
        className,
        isOver && "border-accent bg-accent/5"
      )}
    >
      {children}
    </div>
  );
}

function KanbanCardDraggable({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "animate-row cursor-grab rounded border border-border bg-surface p-3 transition-[border-color,background-color,box-shadow,translate,opacity] duration-150 hover:-translate-y-px hover:border-white/15 hover:bg-white/5 hover:shadow-lg hover:shadow-black/20 active:cursor-grabbing",
        isDragging && "border-dashed border-white/15 opacity-30"
      )}
    >
      {children}
    </div>
  );
}
