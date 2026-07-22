# Build Prompts — Trydent CRM Roadmap

Copy-paste one prompt per session. Each assumes the standing workflow:
edit real files → verify with `npx tsc --noEmit && npx eslint .` → hand me
git commands → new tables/columns go in a new `supabase/migrations/*.sql`
file (idempotent) AND get folded into `supabase/schema.sql`. Follow
`design.md` for all UI. Update the Linear docs when a prompt changes
architecture or schema.

---

## Sprint 1 — Daily-driver gaps

### 1. My Work view + task priorities

> Add a "My Work" page as the new landing experience. Migration: add
> `priority` (urgent/high/normal/low enum, default normal) to
> `project_tasks`. The page shows my assigned tasks across ALL projects,
> grouped into Overdue / Today / This Week / Later, each row with project
> name, priority flag (colored like Linear's), status picker, and due date —
> clicking opens the task drawer. Add a priority picker to the task drawer
> and priority flags on board cards and list rows. Add My Work to the
> sidebar (top, above Dashboard), the ⌘K menu, and the tab-bar title map.
> Sort every task list by priority within status.

### 2. Filter bar + saved views

> Build a reusable FilterBar component (shadcn styling per design.md) for
> the Clients table, Pipeline board, project task views, and Schedule list:
> filter by assignee, status, label, priority, and due-date range;
> free-text filter; active filters shown as removable chips. Add sort
> controls to tables (click column headers). Persist the last-used filters
> per page in localStorage as "saved views" with a name dropdown (save
> current / rename / delete). No backend changes.

### 3. Bulk actions

> Add multi-select to the project task List view and the Clients table:
> checkboxes on hover, shift-click ranges, a floating bottom action bar
> (Linear-style) when >0 selected showing count + actions — set status, set
> assignee, set priority, set due date, add label, delete (confirm).
> Optimistic updates, one supabase `.in()` call per action, toast on
> completion. Esc clears selection.

---

## Sprint 2 — Depth & memory

### 4. Recurring tasks + recurring schedule items

> Migration: add `recurrence` (none/daily/weekly/biweekly/monthly) and
> `recurrence_parent_id` to `project_tasks` and `activities`. When a
> recurring task is marked Done (or a schedule item's date passes), create
> the next occurrence automatically (client-side on completion is fine — no
> cron). Add a recurrence picker to the task drawer and schedule form, a ↻
> indicator on rows/cards/calendar chips, and "skip this occurrence" in the
> task drawer menu.

### 5. Activity history (audit trail)

> Migration: `task_events` table (task_id, actor_id, kind, from_value,
> to_value, created_at) with staff-all/client-read-own RLS. Log status
> changes, assignments, priority changes, due-date changes, and approvals —
> written from the app's update helpers (one shared `logTaskEvent` util).
> Show a collapsed "Activity" section at the bottom of the task drawer
> ("Gokul changed status Backlog → In Progress · 2h ago"). Also add a
> project-level Activity tab merging events from all its tasks.

### 6. Deep search

> Upgrade ⌘K search to match inside task descriptions, comments, client
> notes, and portal updates — not just names. Create a Postgres function
> `search_all(query text)` using `ilike` across the relevant tables
> (respecting RLS via security invoker), returning typed rows (kind, id,
> title, snippet, link). Debounce input 200ms, highlight the matched
> snippet under each result, keep the existing grouped layout.

---

## Sprint 3 — Files & money (Linear TRY-35, TRY-36)

### 7. File attachments (TRY-35)

> Add file attachments via Supabase Storage. Create a private bucket
> `attachments` with RLS: staff full access; clients read files under their
> own client folder and can upload to an `incoming/` prefix. Migration:
> `attachments` table (task_id nullable, project_id, client_id, name, path,
> size, content_type, uploaded_by). UI: drag-and-drop upload zone in the
> task drawer and project Overview; preview images inline; download others.
> Portal: clients see deliverable files per task and get an "Upload brand
> assets" card. Walk me through creating the bucket in the dashboard.

### 8. Payments log + revenue analytics (TRY-36, TRY-34)

> Migration: `payments` table (deal_id, amount, paid_on, note). Replace the
> single `paid` field UX: the deal drawer gets a payments list + add-payment
> form; `deals.paid` becomes a computed display (sum of payments — keep the
> column in sync on insert/delete for compatibility). Build a Revenue page
> (sidebar, under Pipeline): paid vs outstanding per client (stacked bars),
> collection rate, monthly cash-in trend — all in our shadcn chart style
> with the ChartTip tooltip. Portal: per-engagement progress bar of
> paid/total.

---

## Sprint 4 — Scale & automation (Linear TRY-37…39)

### 9. Project templates

> Migration: `project_templates` + `template_tasks` tables (staff-only
> RLS). "Save as template" in the project page ⋯ menu (copies task names,
> labels, priorities, relative due-day offsets). "New from template" option
> in the New Project drawer: pick template + start date → creates the
> project with all tasks, due dates offset from start. Manage templates
> (rename/delete) in Settings.

### 10. Email notifications via Resend

> Wire Resend for outbound email (I'll create the account and add
> RESEND_API_KEY to Vercel — walk me through it). Server route
> `/api/notify-email` called after key events: client approves/comments
> (email me), and I post a portal update (email the client's contact,
> with an unsubscribe flag on client_portals). Nice dark-theme HTML
> template matching our brand. Batch: never more than one email per
> event, log sends to a `notification_emails` table.

### 11. Meeting requests from the portal (TRY-38)

> Let clients request meetings: I define open slots in Schedule
> ("availability" toggle on a schedule item or a simple weekly-hours
> setting), the portal shows a "Book a call" card with available slots,
> picking one creates an activity flagged `requested=true` that I
> confirm/decline from Schedule (notification either way, and the portal
> shows the state).

### 12. Per-portal branding (TRY-39) + project notes

> Two small features: (a) per-client portal branding — logo URL + brand
> color on client_portals; the portal header and progress bars use it.
> (b) an in-app Notes tab on the project page — one rich-ish text area
> (markdown, rendered on blur) stored on a `project_notes` table,
> autosaved, staff-only.

---

## Cleanup & quality prompts

### 13. Repo hygiene

> Cleanup pass: delete the orphaned `src/components/ui/Select.tsx` and the
> cancelled `2026-07-19_portal_password_visibility.sql`, gitignore
> `tsconfig.tsbuildinfo` (and untrack it), grep for unused
> exports/imports/components and remove them, and make sure every migration
> is reflected in schema.sql. Then update design.md and the Linear docs
> (01–05) to match today's reality.

### 14. Data-fetching performance pass

> Performance pass: `useSupabaseTable` refetches whole tables on every page
> mount with no cache. Add a lightweight module-level cache with
> stale-while-revalidate (show cached rows instantly, refetch in
> background), scope heavy queries (schedule and dashboards only need a
> date window; task queries can select by project), and add `select`
> column lists instead of `*` where rows are wide. Measure: no page should
> fire more than 4 queries on mount.

### 15. Mobile deep pass

> Mobile audit and fix: walk every page at 390px width. Known suspects: the
> project header card wrapping, DashGrid handles on touch (add long-press
> drag), the task drawer's subtask board (stack columns vertically on
> mobile), week calendar all-day row height, table overflow behavior, and
> the ⌘K dialog sizing. Touch targets minimum 40px. Fix everything you
> find, list what changed.

### 16. Accessibility pass

> Accessibility pass: keyboard-navigate the whole app and fix what breaks —
> focus visibility on all interactive elements, focus return after
> drawers/menus close, aria-labels on every icon-only button, alt text,
> color-contrast check of muted text on panel (bump tokens if below AA),
> and make drag-and-drop actions all achievable without a mouse (status
> pickers already cover kanban moves — verify and fill gaps).

---

Recommended order: 1 → 2 → 3, then 4 → 5 → 6, then sprints 3–4, with
cleanup prompts (13–16) interleaved whenever a session has room.
