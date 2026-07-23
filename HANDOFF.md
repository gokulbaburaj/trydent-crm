# Trydent Labs CRM — Session Handoff

Paste this whole document as the first message in a new session so Claude has
full context immediately. Last updated: 2026-07-21.

## What this is

A full-stack CRM + client-portal web app for Trydent Labs (Gokul's marketing
agency), replacing his old Notion CRM. Real deployable product, live at
**traid3nt.xyz** (custom domain connected via Hostinger DNS → Vercel).
GitHub repo `gokulbaburaj/trydent-crm` auto-deploys to Vercel on push to main.

Stack: Next.js 16 (App Router) + TypeScript strict + Tailwind v4 +
**shadcn/ui** (real registry components: Radix, cva, cmdk, react-day-picker,
sonner) + Supabase (Postgres/Auth/RLS). Extras: dnd-kit, Recharts, date-fns.

## User context — read before doing anything

- Gokul has limited terminal experience. Give exact copy-paste commands and
  plain-language steps. He runs ALL git commands himself in his Terminal.
- Standing workflow per change: edit files at the real path → verify with
  `npx tsc --noEmit && npx eslint .` (must be clean) → give him
  `git add -A && git commit -m "..." && git push` → Vercel auto-deploys.
- **Never** run `npm run build` in the sandbox (network-restricted; fails on
  swc download — not a code problem). `npm install` also can't run in the
  sandbox — if a new package is needed, give Gokul the install command.
- The sandbox can READ/WRITE files but cannot DELETE them (`rm`/unlink =
  "Operation not permitted"). To remove a file, empty it or ask Gokul.
- Database changes: write a NEW idempotent file in `supabase/migrations/`
  (drop-if-exists + create pattern), tell Gokul to paste it in the Supabase
  SQL editor, AND fold the change into `supabase/schema.sql` (consolidated,
  fresh-installs only). The Supabase "destructive operation" warning on our
  migrations is expected — tell him to Run anyway.

## Key repo files (the project's memory — read these)

- `design.md` — the design contract: tokens, radius, motion, patterns,
  gotchas. Follow it for ALL UI work.
- `prompts.md` — the roadmap as ready-to-paste build prompts (Sprints 1–4 +
  cleanup). Gokul pastes one per session. Next up is tracked there.
- `supabase/schema.sql` — consolidated schema; `supabase/migrations/` —
  applied history.
- Linear workspace (MCP connected): project "TRYDENT LABS - CRM" holds docs
  01–05 (architecture, design system, data model, modules, workflows),
  milestones, and issues TRY-5…TRY-39. Keep docs/issues updated after
  significant work.

## Design system (details in design.md)

shadcn/ui dark neutral (#0a0a0a shell, #171717 cards, white-alpha borders,
10px radius scale) with a Linear-inspired shell: sidebar + browser-style tab
bar (persistent per-page tabs, localStorage) + rounded `--panel` canvas.
Brand color = `--primary`, user-adjustable from Settings (presets + custom
hex); NEVER use `accent` for brand (it's a shadcn hover surface). Motion:
fast ease-out-expo, `withViewTransition()` for layout morphs (card reorder,
calendar drag-drop, theme crossfade). Real shadcn components live in
`src/components/shadcn/` (CLI output — regenerate, don't hand-edit); app
wrappers with legacy prop APIs in `src/components/ui/` (Button
primary/danger, Badge tone system, Drawer→Sheet, Popover render-prop→Radix,
Dropdown→Radix Select, DatePicker→day-picker, StatusPicker, PriorityPicker,
Tooltip Tip, Skeletons, EmptyState, DashGrid). Pages import from `ui/`,
never `shadcn/` directly.

## Data model (details in Linear doc 03 + schema.sql)

Roles admin/rep/client via `profiles.role`; RLS helpers `current_role_name()`
/ `current_client_id()`; staff FOR ALL, clients SELECT-own everywhere.
Tables: profiles, clients (tags, status), deals (pipeline), activities
(= "Schedule" in UI; `color` for calendar chips), projects, project_tasks
(status, **priority urgent/high/normal/low**, due, assignee, description,
links jsonb, label, approved_at/by), task_items (subtasks), task_comments,
portal_updates, notifications (fan-out to staff via `notify_staff()`),
client_portals (portal_username, last_opened_at; **passwords are NOT
stored** — deliberate decision after discussion; reset-to-reveal flow only).
Functions: `handle_new_user()` (metadata-aware, `set search_path = public`
required), `touch_portal()`, `approve_task()`, comment-notify trigger.
Portal logins: admin creates via `/api/portal-users` (needs
`SUPABASE_SERVICE_ROLE_KEY` in Vercel); usernames auto-generated from
company name → `username@portal.trydentlabs.com`; clients sign in with bare
username at /login.

## Features built (all live)

**Admin**: My Work landing page (open tasks grouped Overdue/Today/This
Week/Later, priority-sorted); Dashboard (greeting, KPI cards, shadcn-style
donut with center total + revenue bars, theme-aware); Clients (table/kanban,
inline status editing, tag editor); Pipeline (dnd kanban, per-column value
totals, multi-currency display toggle USD/INR/EUR/CAD/AUD/AED — display
only, stored numbers unchanged); Projects (per-project dashboard with
movable/resizable DashGrid cards: progress ring, checklist, mini calendar,
upcoming meetings, Gantt-style timeline; Kanban/List/Calendar views;
quick-add task/meeting from calendar days); Task drawer (description,
deliverable links, label chips, priority, subtask mini-board, comment
thread, client-approval banner); Schedule (week time-grid + redesigned
month view, activities + task due dates + project deadlines, drag to
reschedule with view-transition morphs, right-click event color picker);
Portals — MERGED into Clients (July 2026): the standalone Portals page is
gone (sidebar/⌘K/tab-map entries removed; `/portals` route now redirects to
`/clients`). Client detail is now a full tabbed PAGE that opens in its own tab
(`clients/[id]/page.tsx`, mirrors project detail: Overview/Portal/Deals/
Activity, inline-editable fields). The old wide `ClientDetailDrawer` was
retired (file stubbed to `export {}`); portal management extracted to
`ClientPortalPanel`. Clients table row/kanban click → `openInNewTab`. Portal
status column (with "never opened" hint) stays for the overview; clients
with no portal get a "Set up portal" button. Team (role editing +
admin-only member removal via `DELETE /api/team-users`, which deletes the
auth user and cascades the profile — needs `SUPABASE_SERVICE_ROLE_KEY`;
can't remove yourself). Team hierarchy DONE: migration
`2026-07-22_team_hierarchy.sql` adds `team` (text) + `reports_to` (uuid self-FK,
on delete set null) to `profiles`; confirm Gokul ran it. Team page has
Members (editable role/team/manager, sortable) and Org chart (teams summary +
recursive reporting tree, cycle-guarded) views; scoped to staff (role !=
client). Staff portal DONE: new `contractor` role (migration
`2026-07-22b_contractor_role.sql` — run FIRST, alone, since a new enum value
can't be used in its own transaction; then `2026-07-22c_staff_portal.sql`).
`staff_payments` table (payment plan lines: label/amount/status/due_date).
RLS: contractors SELECT/UPDATE only their own `project_tasks` (assigned_to =
uid), SELECT own `activities`, SELECT own `staff_payments`; they match no
policy on clients/deals/projects so those stay invisible. Admins add people
via `POST /api/team-users` (roles admin/rep/contractor) — this also fixed
"can't add team members". Team page: "Add member" form + a payment-plan
editor (CreditCard icon on contractor rows). Contractors are routed to
`/staff-portal` (my tasks w/ status picker, schedule, payment plan) via the
dashboard layout, same minimal-shell pattern as clients. Admins can preview a
contractor's portal via `/staff-portal?user=<profileId>` (Eye button on
contractor rows) — read-only status, filters all tables to the target person.
Confirm Gokul ran BOTH migrations in order. Settings (theme accent picker); notifications bell
(unread badge, 60s poll, triggers on client comment/approval/first portal
open); ⌘K command palette (cmdk — pages/clients/projects/deals/theme);
toasts (sonner); tooltips; skeleton loading; gradient avatars; login-page
brand glow; mobile nav (hamburger + slide-in).

**Client portal** (/portal): welcome, updates feed from team, project cards
with progress, per-task comment threads + Approve buttons on Done tasks,
payments summary, notes. Staff can preview any portal via
`/portal?client=<id>`.

## In flight / next

Working through `prompts.md` one prompt per session. DONE: Sprint 1 prompts
1 (My Work + priorities — migration `2026-07-21_task_priorities.sql`;
confirm Gokul ran it) and 2 (Filter bar + saved views — reusable
`FilterBar` on Clients/Pipeline/project tasks/Schedule list, sortable
`DataTable` headers, per-page saved views in localStorage via
`lib/filters.ts`; no backend changes) and 3 (bulk actions — multi-select on
Clients table + project task List via `lib/useMultiSelect.ts` (shift-click
ranges, Esc clears) and floating `BulkActionBar` with one `.in()` call per
action; clients get status/owner/last-contact/delete — tags skipped since
per-row arrays can't be set in a single `.in()` update). DONE Sprint 2
prompt 4 (recurring tasks + schedule items — migration
`2026-07-22_recurrence.sql` adds `recurrence` enum
(none/daily/weekly/biweekly/monthly) + `recurrence_parent_id` to
`project_tasks` and `activities`; confirm Gokul ran it. Logic in
`lib/recurrence.ts` (`nextOccurrence`, `nextTaskPayload`,
`nextActivityPayload`); `RecurrencePicker`/`RecurrenceIndicator` in
`components/ui/`. A recurring task marked Done spawns its next occurrence
(child references parent via `recurrence_parent_id`, which also de-dupes so
toggling Done off/on won't double-spawn). Schedule items spawn on a
once-per-load client-side sweep in schedule/page.tsx (advances past elapsed
dates to the next future one — no cron). Recurrence picker in task drawer +
schedule form; "Skip this occurrence" in the task drawer `…` menu; ↻ marks
on board cards, list rows, My Work rows, schedule table, week events, month
chips.). NEXT: Sprint 2 prompt 5 (activity history / audit trail). Linear
backlog mirrors this (TRY-35…39 for Sprints B/C ≈ prompts Sprints 3–4).

## Later additions (July 22–23, 2026)

- Client detail is a full tabbed PAGE (`clients/[id]`), opened via `openInNewTab`.
  `ClientDetailDrawer` is retired (stubbed `export {}`); portal management lives
  in `ClientPortalPanel`. Portals page merged into Clients (`/portals` redirects).
- Team hierarchy: `profiles.team` + `profiles.reports_to`
  (`2026-07-22_team_hierarchy.sql`). Team page = Members + Org chart views.
- Staff portal for contractors: `contractor` role (`2026-07-22b`, run ALONE
  first), `staff_payments` + RLS (`2026-07-22c`). `/staff-portal` with admin
  preview via `?user=<id>`. Add/remove members via `/api/team-users`.
- Money: all amounts are STORED in `app_settings.base_currency`
  (`2026-07-23_app_settings.sql`); the display toggle converts at live rates via
  `/api/fx` (6h server cache + localStorage). If rates fail, amounts render in
  the base currency rather than faking a conversion. Changing the base does NOT
  re-value records.
- Pipeline: `Negotiation` merged into `Proposal` (`2026-07-22d`). The enum value
  still exists in Postgres (can't drop) but the app never produces it.
- Sidebar (`lib/nav.ts` + `Sidebar.tsx`): collapsible sections, drag-to-reorder
  via dnd-kit (5px activation so clicks still navigate), and a "Your teams"
  section where each team expands to Members (`/team?team=`) and Projects
  (`/projects?team=`). Sidebar uses `useSearchParams`, so it's wrapped in
  `Suspense` in the dashboard layout — same for the Team and Projects pages.
- Portal redirect flash fixed: middleware routes portal users by their JWT role
  metadata before any app route renders; the layout also refuses to paint a page
  it's about to navigate away from.

## Charts (Bklit UI)

Charts come from the **@bklit** shadcn registry (visx + motion), registered in
`components.json`. Source lives in `src/components/charts/` — vendored, so it's
eslint-ignored (regenerating would overwrite fixes); tsc still checks it.
Install more with `npx shadcn@latest add @bklit/<name>`. Installed: pie, ring,
area, bar, funnel. Palette comes from the existing `--chart-1…5` tokens, and
`--chart-1` is wired to `--primary`, so charts follow the brand accent.

**`shadcn add` reclaims files — both traps are now permanently defused:**
1. It overwrites `src/lib/utils.ts` (the `utils` alias) with the stock
   `cn`-only version. This broke the build twice. Our helpers therefore live in
   **`src/lib/format.ts`** (`formatDate`, `initials`, `withViewTransition`) —
   import them from `@/lib/format`, NEVER add them back to `lib/utils.ts`.
2. Generated `charts/chart-loading-label.tsx` imports
   `../components/shimmering-text`, which resolves to
   `src/components/components/shimmering-text.tsx`. That path now exists as a
   re-export shim — don't delete it; it survives regeneration.

After any `shadcn add`, just run `npx tsc --noEmit` before pushing.

Recharts is fully removed from `src/` — safe to `npm uninstall recharts`.

The installer also appends light + greyscale chart palettes to `globals.css`
(`--chart-1: oklch(1 0 none)` = white). Our dark values live in `:root` and a
minimal `.dark { --chart-1..5 }`. If a future install re-appends a greyscale
block, delete it — series colours must stay tied to `--primary`.

## Currency (per-deal)

Each deal stores its own `currency` (migration `2026-07-23c_deal_currency.sql`);
`deal_value`/`paid` are in THAT currency. `app_settings.base_currency` is the
default for new deals + the currency all cross-deal SUMS are done in.
`useCurrency()` exposes `format(value, from?=base)` (converts from→display,
falls back to native when rates missing), `toBase(value, from)` for summing
mixed-currency deals, and `convertAmount`. `CurrencyCode` now lives in
`lib/types` (lib/currency re-exports it) to avoid a circular import. Every deal
display passes the deal's currency; every deal total sums `toBase` first.
`staff_payments` stay in the base currency (unchanged).

## Known gotchas

- Tailwind v4 silently ignores unknown theme tokens — grep after renames.
- Radix Select forbids empty-string values (Dropdown maps a sentinel).
- Kanban DragOverlay is portaled to body — keep it out of transformed
  ancestors. Dragged original becomes a dashed slot.
- eslint rule `react-hooks/set-state-in-effect` is enforced — wrap initial
  setState in `queueMicrotask` or use `useSyncExternalStore` (see
  lib/currency.ts, lib/tabs.tsx patterns).
- The Inter font var must stay `--font-inter` (circular-reference trap).
- `formatDistanceToNow`/`parseISO` from date-fns are used widely; money
  ALWAYS goes through `useCurrency().format`.
- New pages must register in 4 places: Sidebar, lib/tabs.tsx PAGE_TITLES,
  TabBar TAB_ICONS, CommandMenu PAGES (+ layout PAGE_TITLES).
- A cancelled no-op migration file exists
  (`2026-07-19_portal_password_visibility.sql`) — ignore or delete.
- `tsconfig.tsbuildinfo` should be gitignored (cleanup prompt 13 covers it).
