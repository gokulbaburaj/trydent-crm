import test from "node:test";
import assert from "node:assert/strict";
import { canMove, moveInOrder } from "./reorder.ts";

const base = ["a", "b", "c", "d"];

test("moves one place in each direction", () => {
  assert.deepEqual(moveInOrder(base, "b", -1), ["b", "a", "c", "d"]);
  assert.deepEqual(moveInOrder(base, "b", 1), ["a", "c", "b", "d"]);
});

test("returns the SAME reference when nothing can move", () => {
  // Not just an equal array — the identical one. The caller feeds this into
  // setState, and a new-but-identical array re-renders the grid and fires a
  // view transition for a move that never happened.
  assert.equal(moveInOrder(base, "a", -1), base, "already first");
  assert.equal(moveInOrder(base, "d", 1), base, "already last");
  assert.equal(moveInOrder(base, "missing", 1), base, "id not in the list");

  // Same rule on an empty list. Held in a variable — comparing two separate
  // `[]` literals compares two different references and passes for the wrong
  // reason, which is what the first version of this line did.
  const empty: string[] = [];
  assert.equal(moveInOrder(empty, "a", 1), empty, "empty list");
});

test("never loses or duplicates an item", () => {
  // A splice-and-insert with a wrong index silently drops one. Walk every id
  // in both directions and check the multiset is untouched.
  for (const id of base) {
    for (const dir of [-1, 1] as const) {
      const next = moveInOrder(base, id, dir);
      assert.equal(next.length, base.length, `${id}/${dir} changed length`);
      assert.deepEqual([...next].sort(), [...base].sort(), `${id}/${dir} changed contents`);
    }
  }
});

test("a single-item list can't move anywhere", () => {
  const one = ["only"];
  assert.equal(moveInOrder(one, "only", -1), one);
  assert.equal(moveInOrder(one, "only", 1), one);
  assert.equal(canMove(one, "only", -1), false);
  assert.equal(canMove(one, "only", 1), false);
});

test("canMove agrees with what moveInOrder actually does", () => {
  // If these ever disagree, a button is enabled that does nothing — or
  // disabled when it would have worked.
  for (const id of [...base, "missing"]) {
    for (const dir of [-1, 1] as const) {
      const moved = moveInOrder(base, id, dir) !== base;
      assert.equal(canMove(base, id, dir), moved, `${id}/${dir}`);
    }
  }
});

test("moving right then left returns the original order", () => {
  const right = moveInOrder(base, "b", 1);
  assert.deepEqual(moveInOrder(right, "b", -1), base);
});

test("walking an item to the end and back preserves the rest", () => {
  let order = base;
  for (let i = 0; i < 5; i++) order = moveInOrder(order, "a", 1); // past the end
  assert.deepEqual(order, ["b", "c", "d", "a"]);
  for (let i = 0; i < 5; i++) order = moveInOrder(order, "a", -1);
  assert.deepEqual(order, base);
});
