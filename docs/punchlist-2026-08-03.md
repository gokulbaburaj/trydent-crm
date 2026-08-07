# Punchlist — 3 Aug 2026

Nine items raised from screenshots. Grouped by kind, with what I already know
about each so the next session doesn't re-derive it.

---

## Quick fixes (small, well understood) — DONE

### 1. Team page header is wrong when scoped ✅
`/team?team=Admin` showed the topbar title "Team" and offered a **New team**
button. Neither fitted a page showing one team's roster.

Fixed by letting a page set the title, rather than threading search params into
the layout — reading `useSearchParams` in `(dashboard)/layout.tsx` would opt the
whole shell into a CSR bailout. New `lib/pageTitle.tsx` holds the context and a
`usePageTitle()` hook; the layout owns the state and Team calls
`usePageTitle(teamFilter ? \`${teamFilter} team\` : null)`. The override carries
the path it was set on, because child effects run before parent cleanup and a
stale title would otherwise flash on navigation.

**New team** is hidden while `teamFilter` is set. **Add member** stays and now
pre-fills the drawer's team with the one you're looking at.

### 6. The History button in the tab bar ✅
It was wired to nothing — no `onClick` at all. Rather than delete it, it now
does the useful thing: `close()` in `lib/tabs.tsx` pushes the tab onto a
`recentlyClosed` stack (capped at 12, deduped by href, persisted alongside the
tabs), and the button opens a popover that reopens them. Reopening routes
through `openInNewTab`, so a tab that's since been reopened gets focused
instead of duplicated.

No ⌘⇧T binding — it's the obvious shortcut and browsers reserve it, so the
keydown never reaches the page. Left a comment saying so, otherwise someone
will add it again.

### 4 + 8. Checkboxes are off-brand ✅
`components/ui/Checkbox.tsx` already existed (built for Settings → roles,
recruiting and onboarding) — the three call sites in this punchlist had just
never been migrated. Replaced the raw `accent-primary` inputs in
`accounts/page.tsx` (paid toggles), `schedule/page.tsx` (Follow-up required,
Show in the client portal) and `projects/[id]/page.tsx` (the same portal toggle
on the meeting form). There are now no native checkboxes left in the app.

Checkbox gained an `align="start"` prop — centring a 16px box against a
two-line label (title plus help text) left it floating.

---

## Real bugs

### 5. Overlapping events in the Schedule week grid — NOT A BUG ✅
**Closed 4 Aug. There was never anything wrong here.** Queried production:
the four blocks in screenshot 7 are four events on four *different* days —
`ewrgwerg` Mon 3, `grg` Tue 4, `wrgerg` Wed 5, `grewrgwr` Thu 6, all at 10:00
UTC (15:30 IST). Each is alone in its own day column, so each correctly gets
the full column width. The screenshot was read as one day's column containing
four spilling blocks; it's four columns containing one block each.

`ergw` is the only genuinely Monday-only event (15:30 UTC = 21:00 IST), which
is why it sits alone — same renderer, same code path, one event, correct.
`activity_date` is `timestamptz` and round-trips properly; the apparent time
shift is just UTC storage rendered in IST.

The now-line "overlap" is also as designed: `NowLine` is `z-10` and events are
`z-auto`, so the line paints over them deliberately.

Two rounds of speculation, both wrong, before anyone queried the database.
The original text is kept below as the record of what was assumed.

~~Screenshot 7. Four meetings at 15:30 render as four side-by-side blocks that
spill past the day column, and the 21:00 one overlaps the now-line.~~

**The diagnosis above is wrong — don't act on it.** `layoutDay` (schedule
page, line ~110) already does the clustering, and it does it correctly. Ported
it out and exercised it (four at 15:30, a 30-minute staircase, a pile followed
by a gap, a 15-event chain, exactly-adjacent events): no two overlapping events
ever share a column, and no block's `left + width` exceeds 100%. Four at 15:30
comes out as four clean 25% columns. So whatever the screenshot shows, it isn't
the columns being unclustered.

Still to work out — what's actually wrong. Leads, in order of suspicion:

1. **Width, not overflow.** A day column is roughly (680 − 56) / 7 ≈ 89px, so
   at `cols=4` each block is ~22px wide, of which `px-1.5` eats 12px. That's
   unreadable and could easily read as "broken" in a screenshot even though the
   geometry is right. If so the fix is a minimum width with overlap (blocks
   shingled, later ones inset and stacked) rather than strict `1/n` division.
2. **The 21:00 / now-line complaint doesn't reproduce from reading either.**
   `NowLine` is `z-10`, `WeekEvent` has no z-index, so the line should already
   paint on top. Worth checking against the real screenshot before assuming.
3. **`EVENT_MINUTES = 60` is a fiction** — activities store only a start time,
   so every event is assumed an hour long. Two events 15 minutes apart are
   treated as overlapping. That's the honest thing to do without an end time,
   but it inflates cluster sizes and therefore column counts.

Next session: get the actual screenshot (7) side by side with the live grid
before writing any code. The probe script is trivial to recreate — it's ~40
lines and only needs `layoutDay` plus fake `{t}` events.

Note this is now more visible because tasks gained times (2026-08-03d) — more
things land on the grid.

### 3. Lag collapsing the project rows ✅
Screenshot 3, the Projects list accordion. Felt slow to collapse.

**It was never a performance problem.** Counted the rows first: 11 active
tasks, 9 live projects, 7 groups. `completionOf` rescanning every task per card
is ~99 comparisons per toggle, so the "rows re-render the whole list" theory is
ruled out at this size — worth revisiting only if tasks reach the thousands.

The actual cause was an asymmetric interaction:

- **Collapsing had no animation at all.** `{!isCollapsed && ...}` unmounts in
  one frame, so the content vanished instantly while the chevron kept turning
  for its `duration-200`.
- **Expanding took 480ms.** Each card carried `animate-row`
  (`fade-up 280ms … both`) plus `staggerDelay(cardIndex, 22, 200)`, and `both`
  holds a card at `opacity: 0` through its delay.

Instant out, half a second in, is what reads as lag.

Fixed with the standing-gotcha pattern the sidebar already uses — a single-row
grid transitioning `grid-rows-[0fr]` → `grid-rows-[1fr]` with `overflow-hidden`
inside. Height can't transition from `auto`, which is why it's a grid and not a
max-height guess. Content stays mounted now; fine at 9 projects, and it's what
makes the transition possible. Dropped the per-card `animate-row` and stagger —
the group wrapper still staggers on page mount, which is the only place that
entrance was doing any work.

**Unverified:** whether this matches the perceived slowness. No browser was
connected to profile against, so the diagnosis is from the code and the row
counts, not from a flame chart.

---

## Features

### 2. Drag to reorder Default views ✅
Settings → Default views is sortable, copying the `Sidebar.tsx` shape —
`DndContext`, `SortableContext`, `verticalListSortingStrategy`. Order is a list
of preference **keys** in localStorage next to the preferences themselves (an
index list silently reshuffles everything the day a new preference is added).

Two deliberate departures from the Sidebar:

- **Listeners on the grip handle only**, not the whole row. The Sidebar spreads
  them across the entire item because that item is a link and a 5px distance
  threshold separates click from drag. These rows contain a Radix dropdown, and
  a pointerdown captured by dnd-kit before Radix sees it means the menu never
  opens.
- `orderedViewPreferences` **dedupes as it reads**. Which found a bug:

**`applyOrder` in `lib/nav.ts` had the same hole** and drives every reorderable
sidebar section. A repeated href in the saved order rendered that nav item
twice under the same React key. localStorage is user-editable and outlives
releases, so this isn't hypothetical. Both functions fixed, both now tested —
`nav.test.ts` and `useViewPreference.test.ts`, 12 tests between them covering
stale keys, duplicates, and items added since the order was saved.

**Unverified:** how the drag feels. No browser connected.

### 7. Hover preview on calendar events ✅
Title, date, time, location, client, attendees and an agenda snippet, on hover
over a week-grid event.

`Tooltip` was checked and rejected: it's styled as an inverted one-liner
(`bg-foreground text-background`, `text-xs text-balance`) with a hardcoded
arrow, so a titled card means fighting all of it. New
`components/ui/HoverCard.tsx` wraps Radix HoverCard — already in the `radix-ui`
umbrella, no new dependency — on the Popover's surface.

It **does** portal, which is correct here: the week grid is a
`max-h-[640px] overflow-y-auto` scroller and an in-flow card gets clipped by
it. The scroll-lock warning applies to Drawers, and this isn't in one. The
component carries that note so it isn't reused blindly.

Forced shut while dragging — a card chasing the block you're moving sits right
under the cursor.

### 9. Channel info button ✅
An "i" in the channel header opening topic, owning team, member count, created
date and creator, plus Archive.

Archive is shown to **admin or the creator**, not creator-only as guessed here.
Checked `pg_policies` first: `channels_update` is
`current_is_admin() OR created_by = auth.uid()`. A UI stricter than RLS hides a
capability people actually have, the same way a UI looser than RLS ships a
button that fails.

`channel_members` is now loaded with `useSupabaseTable` for the count. That's
safe because it's bounded by channels × staff — unlike `messages`, which is
why that one paginates.

---

## Standing gotcha, learned the hard way today

Anything that portals to `<body>` — Radix popovers, tooltips, dropdowns — is
**outside the scroll lock** a modal dialog installs (`react-remove-scroll`).
Wheel events get swallowed while pointer drags still work, which looks like a
half-broken scroller. If a floating element lives inside a Drawer, render it in
normal flow instead. `components/ui/TimePicker.tsx` has the full explanation.

---

## Still open from before

- **Portal end-to-end walkthrough** (`docs/portal-walkthrough.md`) — runnable
  from the agent side once a browser is connected via the Claude in Chrome
  extension. Waiting on the connection, not on a human.
- **Thekkan Revolution figures** — 900 AUD / 350 paid in the CRM, doesn't
  reconcile with ₹30,000 in Notion. Owner to confirm which is right.
