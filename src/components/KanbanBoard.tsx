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
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsPhone } from "@/lib/useMediaQuery";

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
  const isPhone = useIsPhone();

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

  // Phones get a stacked list, not a board. Side-by-side columns on a 390px
  // screen means every column is a sliver and drag-and-drop fights the
  // browser's own scroll gesture. Each column becomes a section; the picker on
  // each row does what dragging did.
  if (isPhone) {
    return (
      <div className="flex flex-col gap-2.5">
        {columns.map((col) => {
          const colItems = items.filter((i) => getColumnId(i) === col.id);
          return (
            <section key={col.id} className="rounded-md border border-border bg-raise">
              <header className="flex items-center justify-between gap-2 px-3 py-2">
                <h3 className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {col.label}
                </h3>
                <div className="flex shrink-0 items-center gap-1.5">
                  {columnMeta?.(col.id, colItems)}
                  <span className="rounded bg-hover px-1.5 py-0.5 text-xs text-muted-foreground">
                    {colItems.length}
                  </span>
                </div>
              </header>
              {colItems.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-border p-2.5">
                  {colItems.map((item) => (
                    <div
                      key={item.id}
                      className="animate-row flex items-start gap-2 rounded border border-border bg-surface p-3"
                    >
                      <div className="min-w-0 flex-1">{renderCard(item)}</div>
                      <MoveSelect
                        columns={columns}
                        current={getColumnId(item)}
                        onMove={(target) => onMove(item, target)}
                      />
                    </div>
                  ))}
                </div>
              )}
              {renderColumnFooter?.(col.id, colItems)}
            </section>
          );
        })}
      </div>
    );
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
                  <span className="rounded bg-hover px-1.5 py-0.5 text-xs text-muted-foreground">
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
            <div className="rotate-2 scale-[1.03] cursor-grabbing rounded border border-primary/50 bg-surface p-3 shadow-2xl shadow-black/60">
              {renderCard(activeItem)}
            </div>
          ) : null}
        </DragOverlay>
      </BodyPortal>
    </DndContext>
  );
}

/**
 * The phone replacement for dragging a card between columns.
 *
 * A transparent native <select> sits over a small button. iOS and Android turn
 * that into their own full-screen picker, which is a far better target than any
 * custom menu we could draw — and it costs one element.
 */
function MoveSelect({
  columns,
  current,
  onMove,
}: {
  columns: KanbanColumn[];
  current: string;
  onMove: (columnId: string) => void;
}) {
  return (
    <div className="relative shrink-0">
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground"
      >
        <ChevronsUpDown className="h-3.5 w-3.5" />
      </span>
      <select
        aria-label="Move to"
        value={current}
        onChange={(e) => {
          if (e.target.value !== current) onMove(e.target.value);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
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
        // Columns share the available width evenly; min-width keeps them
        // readable and lets the row scroll once space runs out.
        "min-w-[15rem] flex-1 rounded-md border border-border bg-raise p-3 transition-colors",
        className,
        isOver && "border-primary bg-primary/5"
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
        "animate-row cursor-grab rounded border border-border bg-surface p-3 transition-[border-color,background-color,box-shadow,translate,opacity] duration-150 hover:-translate-y-px hover:border-edge hover:bg-hover hover:shadow-lg hover:shadow-black/20 active:cursor-grabbing",
        isDragging && "border-dashed border-edge bg-transparent"
      )}
    >
      {/* While dragging, the clone follows the cursor — the origin becomes an empty dashed slot. */}
      <div className={isDragging ? "invisible" : undefined}>{children}</div>
    </div>
  );
}
