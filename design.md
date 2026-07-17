# Trydent CRM — Design Contract

The single source of truth for how this app looks and moves. If a change
conflicts with this file, either follow this file or update it in the same PR.

## System

**shadcn/ui, dark only, neutral base** — real registry components in
`src/components/shadcn/` (installed via `npx shadcn@latest add <name>`, never
hand-edited). App wrappers in `src/components/ui/` adapt legacy prop names
(`variant="primary" | "danger"`, `tone="green"`, Drawer/Popover/Dropdown APIs).
Pages import from `ui/`, not `shadcn/`.

Shell is Linear-inspired and non-negotiable: dark sidebar on `--background`,
browser-style tab bar, content inside a rounded `--panel` canvas.

## Tokens (globals.css — change here, nowhere else)

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#0a0a0a` | shell, sidebar |
| `--panel` | `#101010` | main canvas |
| `--card` / `--popover` | `#171717` | cards, menus, inputs' popovers |
| `--primary` | user-chosen (default `#5e6ad2`) | brand: buttons, rings, selection, charts |
| `--secondary` / `--muted` / `--accent` | `#262626` | shadcn support surfaces (accent ≠ brand!) |
| `--muted-foreground` | `#a3a3a3` | secondary text |
| `--border` / `--input` | white 10% / 15% | hairlines, control borders |
| `--success` `--warning` `--destructive` | green/amber/red | semantic only |
| `--radius` | `0.625rem` | drives the whole radius scale |

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
