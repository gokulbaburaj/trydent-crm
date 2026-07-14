"use client";

import { ReactNode } from "react";
import {
  DndContext,
  DragEndEvent,
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
}: {
  columns: KanbanColumn[];
  items: T[];
  getColumnId: (item: T) => string;
  onMove: (item: T, columnId: string) => void;
  renderCard: (item: T) => ReactNode;
  renderColumnFooter?: (columnId: string, items: T[]) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colItems = items.filter((i) => getColumnId(i) === col.id);
          return (
            <KanbanColumnDroppable key={col.id} id={col.id}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-foreground">{col.label}</h3>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-muted">
                  {colItems.length}
                </span>
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
    </DndContext>
  );
}

function KanbanColumnDroppable({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-72 shrink-0 rounded-md border border-border bg-white/[0.02] p-3 transition-colors",
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
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded border border-border bg-surface p-3 active:cursor-grabbing hover:bg-white/5",
        isDragging && "opacity-70 shadow-xl"
      )}
    >
      {children}
    </div>
  );
}
