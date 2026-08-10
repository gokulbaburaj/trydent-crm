import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORICAL_HUES, hueFor } from "./palette.ts";

test("the same key always gets the same hue", () => {
  // The point of the whole module: a project is the same colour on the
  // schedule as on its own timeline, today and after a reload.
  assert.equal(hueFor("project-abc"), hueFor("project-abc"));
});

test("hues are always one of the palette entries", () => {
  const keys = ["", "a", "project-abc", "0".repeat(500), "🙂", "-1"];
  for (const k of keys) {
    assert.ok(
      (CATEGORICAL_HUES as readonly string[]).includes(hueFor(k)),
      `${JSON.stringify(k)} produced ${hueFor(k)}`
    );
  }
});

test("a long key doesn't drift out of range", () => {
  // Without the `| 0`, hash grows past Number.MAX_SAFE_INTEGER and the
  // modulus starts landing on the same few entries.
  const long = "x".repeat(10000);
  assert.ok((CATEGORICAL_HUES as readonly string[]).includes(hueFor(long)));
});

test("nearby keys don't collapse onto one hue", () => {
  // Sequential ids are the common case (task-1, task-2, ...). If the hash
  // ignored position, they'd all land together and the colouring would be
  // useless for exactly the data it exists to separate.
  const used = new Set(
    Array.from({ length: 12 }, (_, i) => hueFor(`task-${i}`))
  );
  assert.ok(used.size >= 4, `only ${used.size} distinct hues across 12 keys`);
});

test("the palette has no duplicate entries", () => {
  assert.equal(new Set(CATEGORICAL_HUES).size, CATEGORICAL_HUES.length);
});
