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
Portals (status tracker, login provisioning + password reset, preview
portal as client, copy client link, last-opened tracking, post updates);
Team (role editing); Settings (theme accent picker); notifications bell
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
