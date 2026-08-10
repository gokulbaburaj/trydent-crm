/**
 * Move one item one place in an ordered list of ids.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * The dashboard grid could only be rearranged by dragging, and dragging was
 * pointer-only — so a keyboard user could not reorder their dashboard at all.
 * Not "awkwardly", at all.
 *
 * The obvious fix is a KeyboardSensor, and it's the wrong one here. DashGrid
 * uses `useDraggable`/`useDroppable` rather than `SortableContext`, so
 * dnd-kit's `sortableKeyboardCoordinates` doesn't apply and the default getter
 * moves 25px per keypress. On a three-column card grid that means mashing an
 * arrow key and guessing when you've crossed a boundary — technically
 * accessible, practically unusable.
 *
 * Explicit move-one-place controls are clearer than emulating a drag, and they
 * help pointer users too: nudging a card one slot by dragging is fiddlier than
 * clicking an arrow.
 *
 * Pure so the edge cases can be tested without a DOM: the interesting ones are
 * all "what happens at the ends of the list" and "what happens to ids that
 * aren't there".
 */

export type MoveDirection = -1 | 1;

/**
 * `order` with `id` moved one place in `direction`.
 *
 * Returns the SAME array reference when nothing can move — at either end, or
 * for an id that isn't in the list. That matters: the caller feeds this
 * straight into `setState`, and returning a new-but-identical array would
 * re-render the grid and, in DashGrid's case, fire a view transition for a
 * move that didn't happen.
 */
export function moveInOrder(
  order: string[],
  id: string,
  direction: MoveDirection
): string[] {
  const from = order.indexOf(id);
  if (from === -1) return order;

  const to = from + direction;
  if (to < 0 || to >= order.length) return order;

  const next = [...order];
  // Swap, not splice-and-insert. For a single-step move they're equivalent,
  // and a swap can't silently drop an element if the indices are ever wrong.
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Can this id move that way? Drives the disabled state on the buttons. */
export function canMove(
  order: string[],
  id: string,
  direction: MoveDirection
): boolean {
  const from = order.indexOf(id);
  if (from === -1) return false;
  const to = from + direction;
  return to >= 0 && to < order.length;
}
