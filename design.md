# Trydent CRM — Design Contract

The single source of truth for how this app looks and moves. If a change
conflicts with this file, either follow this file or update it in the same PR.

## System

**shadcn/ui, light, warm neutral base** — real registry components in
`src/components/shadcn/` (installed via `npx shadcn@latest add <name>`, never
hand-edited). App wrappers in `src/components/ui/` adapt legacy prop names
(`variant="primary" | "danger"`, `tone="green"`, Drawer/Popover/Dropdown APIs).
Pages import from `ui/`, not `shadcn/`.

Shell as of 9 Aug: a labelled nav rail on `--background` (foldable to 60px
icons), browser-style tab bar, content inside a rounded `--panel` canvas.

The rail's sections are named for INTENT — My Work, Customers, Sales,
Performance, Organization — not for object type. The previous "Workspace"
bucket held six unrelated pages under a label that never narrowed the search,
so you read all six every time. An accurate section label beats a tidy one.

Record surfaces use **list-detail**, not table-plus-drawer. See
`src/components/RecordShell.tsx` for the full reasoning; the short version is
that a drawer covers the list it came from, isn't addressable, and caps detail
at ~480px. Selection lives in the URL (`?r=<id>`) via `router.replace`, so
reading through a queue leaves one history entry rather than one per record.

## Tokens (globals.css — change here, nowhere else)

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#f4f5f2` | shell, nav rail |
| `--panel` | `#f4f5f2` | main canvas |
| `--card` / `--popover` | `#ffffff` | cards, menus, inputs' popovers |
| `--primary` | user-chosen (default `#5e6ad2`) | brand: buttons, rings, selection, charts |
| `--secondary` / `--muted` / `--accent` | `#262626` | shadcn support surfaces (accent ≠ brand!) |
| `--muted-foreground` | `#a3a3a3` | secondary text |
| `--border` / `--input` | black 8% / 12% | hairlines, control borders |
| `--success` `--warning` `--destructive` | green/amber/red | semantic only |
| `--radius` | `1.25rem` | drives the whole radius scale |

### The four colour systems

Independent, and keeping them independent is the point. Each answers a
different question; the moment two of them colour the same chip, neither means
anything.

| System | Question | Tokens | Rule |
| --- | --- | --- | --- |
| **wash** | where am I | `--wash`, `--wash-card` | ONE gradient, scoped to the record pane. Cards are translucent windows onto it, never individually painted — hue tracks position. |
| **heat** | how much is this | `--heat-0..4` | Value maps to hue. Nothing else in the app is allowed to. Bucketing lives in `lib/heat.ts`. |
| **primary** | what stage | `--primary` | Process, progress, selection. Stays user-adjustable in Settings. |
| **ink** | what do I do | `--foreground` | Primary actions and the active tab. Exactly one black control per view. |

The wash is fixed and warm, deliberately NOT derived from `--primary`: an
indigo-derived gradient comes out cold and violet, and the warmth is most of
what separates this from a themed admin panel.

A `WashCard` outside a `WashPane` is plain translucent white. That degrades
quietly rather than breaking — but it also won't look like anything, so it is
not a general-purpose card. Use `Card`.

**Calendar blocks** are a wash + one saturated left edge + label text in the
same hue. Never a pale fill with dark text — that's a light-mode card dropped
into a dark app, which is what shipped before 4 Aug.

Two axes, deliberately separate. *Category* ("this is a meeting" vs "this is a
task") uses the fixed `--event-<hue>-bg` / `-bar` / `-fg` tokens. *Per-event*
identity comes from `EVENT_HUES` + `eventHue()` in `schedule/page.tsx`, in TS
because a user-chosen `activities.color` is an arbitrary hex. **Every view of
the same activity must call `eventHue`** — week and month once had separate
palettes hashed with different moduli, so one event was pink in one view and
blue in the other.

Rules: brand color is always `primary` (never `accent`); green means "good"
(Done/Won/Active), never decoration; interaction states are white-alpha
(`bg-white/5` hover, `bg-white/10` active); text on `primary` uses
`primary-foreground` (auto-picked by luminance in `src/lib/theme.tsx`).

## Radius & shape

Cards `rounded-xl` + `shadow-sm`. Controls (buttons/inputs/selects, h-8/h-9)
`rounded-md`. Menus/popovers `rounded-lg`. Badges `rounded-full` pills.
Circles only for avatars and status dots.

## Motion

Fast and small: 130ms menus (`animate-pop`), 240ms page entrances
(`animate-page`), 280ms staggered rows (`animate-row`), ease-out-expo
`cubic-bezier(0.16, 1, 0.3, 1)`. Layout changes that move elements
(card reorder, calendar drag-drop, theme change) go through
`withViewTransition()` from `src/lib/utils.ts` so they morph. Kanban drags use
a portaled DragOverlay with a 200ms drop animation; the original becomes a
dashed slot. Everything must respect `prefers-reduced-motion`.

## Typography

Inter via `next/font` (`--font-inter` — never rename to `--font-sans`,
it creates a circular variable). Base 14px. Page titles 15px semibold,
card titles `text-sm font-semibold`, meta `text-xs text-muted-foreground`.

## Patterns

- Status chips are clickable (`StatusPicker`) — never a bare read-only badge
  where editing makes sense
- Destructive actions live behind a `…` menu or confirm()
- Every list/table needs an `EmptyState` with a call-to-action
- Every save/error surfaces a sonner toast
- Money always goes through `useCurrency().format` (multi-currency display)
- Dates always use `DatePicker`, times use the Dropdown time picker —
  no native pickers anywhere
- New pages get: tab-bar title mapping (`src/lib/tabs.tsx`), ⌘K entry
  (`CommandMenu`), and mobile stacking

## Gotchas

- Tailwind v4 silently ignores unknown theme tokens — grep after renames
- Radix Select forbids `""` item values (Dropdown maps a sentinel)
- shadcn `dark:` variants follow OS `prefers-color-scheme` (no `.dark` class)
- Supabase auth triggers need `set search_path = public`
