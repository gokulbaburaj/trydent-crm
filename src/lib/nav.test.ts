import test from "node:test";
import assert from "node:assert/strict";
import { applyOrder } from "./nav.ts";

/**
 * Drives every reorderable section of the sidebar. The saved order lives in
 * localStorage, so it is user-editable and outlives releases — these tests are
 * about what happens when it disagrees with the code.
 */

const items = [
  { href: "/my-work", label: "My Work" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
];
const hrefs = (list: { href: string }[]) => list.map((i) => i.href);
const ALL = hrefs(items);

test("no saved order leaves the declared order alone", () => {
  assert.deepEqual(hrefs(applyOrder(items, undefined)), ALL);
  assert.deepEqual(hrefs(applyOrder(items, [])), ALL);
});

test("a saved order is applied", () => {
  const reversed = [...ALL].reverse();
  assert.deepEqual(hrefs(applyOrder(items, reversed)), reversed);
});

test("an item added since the order was saved lands at the end", () => {
  const partial = ["/clients", "/my-work"];
  const result = hrefs(applyOrder(items, partial));
  assert.deepEqual(result.slice(0, 2), partial);
  assert.equal(result.length, ALL.length, "nothing is dropped");
});

test("an href that no longer exists is ignored", () => {
  const result = hrefs(applyOrder(items, ["/gone", ...ALL]));
  assert.ok(!result.includes("/gone"));
  assert.equal(result.length, ALL.length);
});

test("a duplicated href does not render the item twice", () => {
  // Two nav items sharing a React key is a real bug, not a cosmetic repeat.
  const result = hrefs(applyOrder(items, ["/clients", "/clients", "/my-work"]));
  assert.equal(new Set(result).size, result.length, "no duplicates");
  assert.equal(result.length, ALL.length, "and still every item");
});

test("every item survives whatever the saved order says", () => {
  for (const saved of [[], ["/gone"], ["/clients", "/clients"], [...ALL].reverse()]) {
    const result = hrefs(applyOrder(items, saved));
    assert.deepEqual([...result].sort(), [...ALL].sort(), `lost an item for ${JSON.stringify(saved)}`);
  }
});
