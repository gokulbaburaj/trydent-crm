"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Multi-select state for lists/tables: plain click toggles one row,
 * shift-click selects the visual range from the last clicked row,
 * Esc clears the whole selection.
 */
export function useMultiSelect() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const lastId = useRef<string | null>(null);

  const clear = useCallback(() => {
    lastId.current = null;
    setSelected(new Set());
  }, []);

  /**
   * Toggle one row. `orderedIds` is the list of row ids in their current
   * visual order (after filtering/sorting) so shift-ranges match the screen.
   */
  const toggle = useCallback(
    (id: string, shiftKey: boolean, orderedIds: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastId.current && lastId.current !== id) {
          const a = orderedIds.indexOf(lastId.current);
          const b = orderedIds.indexOf(id);
          if (a !== -1 && b !== -1) {
            for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
              next.add(orderedIds[i]);
            }
            lastId.current = id;
            return next;
          }
        }
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        lastId.current = id;
        return next;
      });
    },
    []
  );

  /** Select or deselect many rows at once (e.g. header "select all"). */
  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  // Esc clears the selection while anything is selected.
  useEffect(() => {
    if (selected.size === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") clear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, clear]);

  return { selected, toggle, setMany, clear };
}
