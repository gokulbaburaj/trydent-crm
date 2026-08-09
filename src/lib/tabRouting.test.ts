import test from "node:test";
import assert from "node:assert/strict";
import { isChildPath, resolveNavigation } from "./tabRouting.ts";

const tab = (id: string, href: string) => ({ id, href });

test("THE BUG: back from a detail view must not duplicate the list tab", () => {
  // Open Projects, click a project, press Back.
  // Old behaviour rewrote the active (detail) tab into a second "Projects"
  // tab, so the strip showed Projects, Projects.
  const tabs = [tab("list", "/projects"), tab("detail", "/projects/abc")];
  const r = resolveNavigation(tabs, "detail", "/projects");

  assert.deepEqual(r, { action: "focus", id: "list" });
  assert.notEqual(r.action, "rewrite", "rewriting is what created the duplicate");
});

test("the detail tab survives — going back doesn't destroy where you were", () => {
  // Focusing rather than rewriting means the detail tab keeps its href, so
  // it's still there when you want it.
  const tabs = [tab("list", "/projects"), tab("detail", "/projects/abc")];
  const r = resolveNavigation(tabs, "detail", "/projects");
  assert.equal(r.action, "focus");
  // The caller leaves `tabs` untouched on focus, so this is a claim about the
  // contract: nothing in the result asks for a mutation.
  assert.ok(!("href" in r), "focus must not carry a rewrite instruction");
});

test("with no existing tab for the path, the active tab follows the route", () => {
  // Clicking a project from the list: nothing shows it yet, so the current
  // tab tracks the navigation. This is the case the old code got right.
  const tabs = [tab("list", "/projects")];
  assert.deepEqual(resolveNavigation(tabs, "list", "/projects/abc"), { action: "rewrite" });
});

test("navigating to where you already are does nothing", () => {
  const tabs = [tab("a", "/projects")];
  assert.deepEqual(resolveNavigation(tabs, "a", "/projects"), { action: "none" });
});

test("the active tab is never focused as if it were another tab", () => {
  // A tab can't be focused to itself. Without the id guard this returns
  // { focus: "a" } and the caller re-pushes the route in a loop.
  const tabs = [tab("a", "/projects"), tab("b", "/clients")];
  assert.deepEqual(resolveNavigation(tabs, "a", "/projects"), { action: "none" });
});

test("duplicate hrefs in restored state resolve to the first, not a crash", () => {
  // Tabs come back from localStorage, which is user-editable and outlives any
  // release. Duplicates shouldn't exist once this ships, but they might.
  const tabs = [tab("a", "/projects"), tab("b", "/projects"), tab("c", "/clients")];
  assert.deepEqual(resolveNavigation(tabs, "c", "/projects"), { action: "focus", id: "a" });
});

test("an unknown activeId falls back to rewrite rather than throwing", () => {
  // Mid-hydration the active id can point at a tab that isn't in the list yet.
  const tabs = [tab("a", "/projects")];
  assert.doesNotThrow(() => resolveNavigation(tabs, "gone", "/clients"));
  assert.deepEqual(resolveNavigation(tabs, "gone", "/clients"), { action: "rewrite" });
  assert.deepEqual(resolveNavigation([], null, "/clients"), { action: "rewrite" });
});

test("a full session never produces two tabs on the same path", () => {
  // Walks the sequence from the bug report: list → detail → back → detail
  // → back, applying the result each time the way the provider does.
  let tabs = [tab("t1", "/projects")];
  let activeId = "t1";
  let nextId = 2;

  const navigate = (pathname: string) => {
    const r = resolveNavigation(tabs, activeId, pathname);
    if (r.action === "focus") activeId = r.id;
    else if (r.action === "rewrite") {
      tabs = tabs.map((t) => (t.id === activeId ? { ...t, href: pathname } : t));
    }
  };
  const openInNewTab = (href: string) => {
    const existing = tabs.find((t) => t.href === href);
    if (existing) { activeId = existing.id; return; }
    const t = tab(`t${nextId++}`, href);
    tabs = [...tabs, t];
    activeId = t.id;
  };

  openInNewTab("/projects/abc");   // click a project
  navigate("/projects");           // browser back
  openInNewTab("/projects/abc");   // click it again
  navigate("/projects");           // back again
  openInNewTab("/projects/def");   // a different project
  navigate("/projects");           // back again

  const hrefs = tabs.map((t) => t.href).sort();
  assert.deepEqual(hrefs, ["/projects", "/projects/abc", "/projects/def"]);
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate hrefs");
  assert.equal(activeId, "t1", "back lands on the list tab that already existed");
});

test("isChildPath doesn't match a sibling that merely shares a prefix", () => {
  // The naive startsWith says /project-templates lives under /projects.
  assert.equal(isChildPath("/projects/abc", "/projects"), true);
  assert.equal(isChildPath("/projects", "/projects"), true);
  assert.equal(isChildPath("/project-templates", "/projects"), false);
  assert.equal(isChildPath("/clients", "/client"), false);
});
