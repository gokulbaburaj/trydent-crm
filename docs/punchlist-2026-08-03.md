# Punchlist — 3 Aug 2026

Nine items raised from screenshots. Grouped by kind, with what I already know
about each so the next session doesn't re-derive it.

---

## Quick fixes (small, well understood)

### 1. Team page header is wrong when scoped
`/team?team=Admin` shows the topbar title "Team" and offers a **New team**
button. Neither fits a page that is showing one team's roster.

- Topbar title comes from `PAGE_TITLES` in `(dashboard)/layout.tsx`, which
  matches on pathname only and can't see `?team=`. Either thread the scope in
  or set the title from the page.
- Hide **New team** while `teamFilter` is set — creating a team from inside one
  team's roster is a non sequitur. **Add member** should stay, and should
  probably default the new person's team to the one you're looking at.

### 6. The History button in the tab bar
Screenshot 6. Question was whether it earns its place. Worth checking what it
actually does before deleting — if it opens recently-closed tabs it's useful and
under-labelled; if it's vestigial it should go. Decide, then act.

### 4 + 8. Checkboxes are off-brand
Two places: the Accounts paid toggles (green tick, reads as an emoji) and the
Edit Schedule Item modal ("Follow-up required", "Show in the client portal").

There is no shared Checkbox component — that's the root cause, and why they
drifted. Build one in `components/ui/`, using the accent token and the same
focus ring as `Input`, then replace both call sites. `DataTable`'s `SelectBox`
is the closest existing thing and is a reasonable visual reference, but it's
private to that file.

---

## Real bugs

### 5. Overlapping events in the Schedule week grid
Screenshot 7. Four meetings at 15:30 render as four side-by-side blocks that
spill past the day column, and the 21:00 one overlaps the now-line.

This is the classic calendar layout problem: events at the same time need to be
grouped into collision clusters, then each cluster split into columns with
width `1/n` and offset `i/n`. Currently they appear to be laid out without any
clustering. Fix in the week view of `(dashboard)/schedule/page.tsx`.

Note this is now more visible because tasks gained times (2026-08-03d) — more
things land on the grid.

### 3. Lag collapsing the project rows
Screenshot 3, the Projects list accordion. Feels slow to collapse.

Suspect, unverified: the rows re-render the whole list on toggle, or the
collapse animates a property that forces layout. Profile before changing
anything — the sidebar collapse was fixed with a `grid-rows` transition and the
same trick may apply, but guessing at a perf problem is how you end up
optimising the wrong thing.

---

## Features

### 2. Drag to reorder Default views
Settings → Default views. The rows are a fixed list; make them sortable.

`Sidebar.tsx` already does exactly this with `@dnd-kit` — `DndContext`,
`SortableContext`, `verticalListSortingStrategy`, order persisted through
`setOrder` in `lib/nav.ts`. Copy that shape rather than inventing a second
pattern. Order belongs in localStorage alongside the view preferences, which
already live there deliberately (see the note under the card).

### 7. Hover preview on calendar events
Show a small card on hover: title, time, client, attendees, agenda snippet.

`Tooltip` exists (`components/ui/Tooltip.tsx`, Radix-backed, already has a
provider mounted in the dashboard layout). Content is richer than a tooltip
usually holds, so check whether it takes arbitrary children or needs a
`HoverCard` instead. Do NOT portal it in a way that lands outside a modal's
scroll lock — see the TimePicker note below.

### 9. Channel info button
An "i" in the channel header opening details: topic, which team owns it, member
count, created date, and probably an archive action for the creator.

Data is all present on `Channel` (`team_id`, `topic`, `created_by`,
`created_at`) plus `channel_members`. Policies already allow reading members of
any channel you can see.

---

## Standing gotcha, learned the hard way today

Anything that portals to `<body>` — Radix popovers, tooltips, dropdowns — is
**outside the scroll lock** a modal dialog installs (`react-remove-scroll`).
Wheel events get swallowed while pointer drags still work, which looks like a
half-broken scroller. If a floating element lives inside a Drawer, render it in
normal flow instead. `components/ui/TimePicker.tsx` has the full explanation.

---

## Still open from before

- **Portal end-to-end walkthrough** (`docs/portal-walkthrough.md`) — needs a
  browser signed in as a client; can't be done from this side.
- **Thekkan Revolution figures** — 900 AUD / 350 paid in the CRM, doesn't
  reconcile with ₹30,000 in Notion. Owner to confirm which is right.
