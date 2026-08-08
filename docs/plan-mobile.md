# Mobile — plan

Dated 7 Aug 2026. Reference screenshots: LeadIQ, BizLink, and two team/CRM
dashboards, all iOS, all light mode.

## Decisions already taken

- **Responsive web, not native.** One codebase, one deploy, works today at
  traid3nt.xyz. No app store, no native push. A React Native app would be a
  second codebase sharing only Supabase, and every feature after that gets
  built twice.
- **Stays dark.** The references are light, `design.md` says dark-only and
  calls the Linear shell non-negotiable. What we take from them is *layout*,
  which is theme-independent. Nothing in the design contract changes.
- **All four surface groups are in scope**, but not at once — see the
  sequence. Picking everything isn't a priority order.

## What the references actually teach

Strip the colour and what's left is worth copying:

- **A bottom tab bar with 4–5 destinations.** Every one of them. Thumb reach
  beats a hamburger.
- **Cards, never tables.** 3–4 fields per card, one of them large. LeadIQ's
  lead card shows name, company, stage, value — four fields where our Clients
  table shows nine columns.
- **Segmented chips for filtering** instead of dropdowns. "All / New /
  Contacted / Proposal" as a scrollable row.
- **One number per card, set big.** `$3.284`, `94%`, `2hr 25min`. Our stat
  cards already do this; they just need to survive a 390px viewport.
- **A floating primary action.** One obvious create button, not a toolbar.

What we should *not* copy: the pastel fills, the white surfaces, and the
photographic avatars. Those are their brand, not ours.

## What's there today

Measured, not assumed:

| Thing | State |
|---|---|
| `DataTable` mobile handling | `overflow-x-auto`. That's all. |
| Pages using `DataTable` | **7** — clients, pipeline, projects, projects/[id], schedule, invoices, team |
| `TabBar` responsive utilities | **0** |
| Pages with 0–1 breakpoint utilities | team, settings/teams, accounts, channels, my-work, invoices |
| Pages with real responsive work | projects/[id] (18), portal (13), projects (9) |
| PWA manifest / icons | none |

So: the shell is desktop-metaphor throughout, and most pages never got the
"mobile stacking" `design.md` claims every page gets.

## Observed on device, 7 Aug

Driven through Claude in Chrome below the `md` breakpoint (sidebar collapsed to
a hamburger, so under 768px). `resize_window` reported sizes it didn't always
apply, so treat the exact widths as approximate — the breakpoint behaviour is
what matters and that was consistent.

**My Work is already right.** It's a card list: flag, status pill, task name,
due date. Reads cleanly, nothing clipped. This is the target shape for every
other list — we're not inventing a pattern, we're propagating this one.

**Clients confirms the `DataTable` problem.** The Email column is clipped
mid-address (`dion@me…`, `tushaar.n`, `solankipr`) with more columns off-screen
to the right. But the row content is already close to a card — avatar, company,
contact name, status pill. Card mode is a re-layout, not a redesign.

**Schedule is the worst of the four, by a distance.** The week grid renders
Mon–Thu plus half of Friday; Saturday and Sunday are simply gone off the right
edge. Only 8 of 24 hours are visible. It needs a day view, not a squeezed week.

**Chrome eats roughly a third of the screen before any data.** On Schedule:
browser tab strip (~55px) + topbar (~70px) + All/Mine/Calendar + New Schedule
Item row (~65px) + month/Today/Week-Month row (~70px) ≈ 260px before the grid
starts. On Clients: tab strip + topbar + view toggle + **two wrapped rows** of
filter chips.

**There is no bottom navigation.** Every single navigation on a phone requires
opening the hamburger drawer. That is the biggest usability gap and it's what
Phase 0 fixes.

## The sequence

### Phase 0 — the shell. Nothing else is usable until this lands.

The app chrome is three desktop ideas stacked: a sidebar, a browser-style tab
strip, and a rounded panel inset. On a phone, two of those are wrong.

- **Bottom tab bar below `md`.** Five destinations: My Work, Schedule,
  Clients, Channels, More. `More` opens the existing drawer for everything
  else, so nothing becomes unreachable.
- **Hide `TabBar` below `md`.** Managing browser-style tabs on a phone is not
  a thing anyone does. The tabs state stays — it's just not shown.
- **Drop the panel inset below `md`.** `p-3` around a rounded card wastes
  ~24px of a 390px viewport for decoration.
- **Safe areas.** `env(safe-area-inset-bottom)` on the tab bar or it sits under
  the home indicator on every notched iPhone.

### Phase 1 — `DataTable` card mode. One component, seven pages.

The single highest-leverage change in this plan. Add a `card` renderer to
`DataTable` that takes over below `sm`, so every consuming page gets a stacked
list without touching seven files.

Shape: each `Column` gains an optional `mobile?: "title" | "meta" | "trailing"
| "hidden"` hint. Columns without a hint don't render on mobile — **opt in, not
opt out**, because nine columns on a phone is the bug we're fixing.

Sorting collapses to a single "Sort by" chip. Row click behaviour is unchanged.

### Phase 2 — the four surfaces, in this order

1. **My Work + Schedule.** What people actually check away from a desk. The
   week grid needs a day view below `sm`; seven columns in 390px is ~50px per
   day, which is unreadable regardless of layout.
2. **Channels.** The one surface where a phone is arguably the *primary*
   device. Mostly there already — needs a proper composer, keyboard-avoidance,
   and the channel list as a slide-over rather than a column.
3. **Clients + Pipeline.** Read-heavy lookup during a meeting. Falls out of
   Phase 1 largely for free; pipeline's kanban needs horizontal snap-scroll.
4. **Projects + Tasks.** Heaviest by far — `projects/[id]` is 2,179 lines with
   a `DashGrid` of draggable, resizable cards. Drag-resize is meaningless on a
   phone; it should collapse to a fixed single-column stack below `md`.

### Phase 3 — touch and polish

- 44px minimum hit targets. Several icon buttons are currently 28px.
- Hover-only affordances need a tap equivalent — the calendar hover cards and
  the `group-hover:opacity-100` delete buttons are invisible on touch.
- `touch-action` on the dnd-kit surfaces so dragging doesn't fight scrolling.

## Open questions

- **Does the client portal count as mobile?** It's the surface most likely to
  be opened on a phone by someone who isn't staff, and it's not in the four
  groups chosen. Worth deciding before Phase 2.
- **PWA later?** Manifest + icons + install prompt is roughly a day on top of
  a responsive app, and it's additive. Deliberately deferred, not rejected.

## Not doing

- No native app.
- No second theme.
- No new dependency — `@dnd-kit` handles touch, and the bottom tab bar is
  markup, not a library.

## Verification

The whole plan is visual, and there is no browser connected. Every phase needs
device checking before it's called done. Connecting Claude in Chrome makes that
checkable from the agent side — see `docs/portal-walkthrough.md`.
