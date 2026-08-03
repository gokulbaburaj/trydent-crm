# What's next — roadmap after Resources

Written 3 Aug 2026, after deleting Resources.

## Where things stand

Pre-launch. One developer, six profiles seeded, real data being entered by hand
(26 deals, 22 clients, 10 projects, 16 tasks — tasks touched yesterday).

Five tables sit at zero rows: `invoices`, `client_documents`, `task_comments`,
`meeting_requests`, and near-zero `portal_messages`. All five are **client
portal** features, and both halves are built — admin side in
`ClientPortalPanel.tsx`, client side in `portal/page.tsx`. They're empty because
no client has logged into a portal yet, not because they're unfinished. Don't
read those counts as abandonment.

## Sequence

Cheap and de-risking first, largest last.

---

### 1. Polish and correctness — DONE 3 Aug

- **`middleware` → `proxy` rename.** Done. `src/middleware.ts` → `src/proxy.ts`,
  exported function renamed. `config`/`matcher` is unchanged between the two
  conventions. Both files must never coexist — the Next docs warn behaviour
  goes unstable if they do, and the old file is gone rather than left behind.
  Comments in `login/page.tsx`, `lib/supabase/server.ts` and `HANDOFF.md`
  updated to match. `AUDIT.md` deliberately left alone: it's dated 27 July and
  describes what existed then.

- **Remaining tables onto `DataTable`** — *withdrawn, nothing to convert.*
  Audited rather than assumed. Every real table already uses `DataTable`:
  Clients, Pipeline, Schedule, Projects, project detail, Team. The only raw
  `<table>` left in `src/` is `components/shadcn/table.tsx`, which nothing
  imports. The three pages this item named turned out not to be tables:
  - **Portals** is a nine-line `redirect("/clients")`.
  - **My Work** is bucketed by due date with per-bucket counts, in a
    `max-w-3xl` column. `DataTable` paginates one flat list, so the buckets
    couldn't survive, and its 980px floor would force horizontal scroll.
  - **Recruiting** list view is card rows *by deliberate choice*, documented in
    place: the table version was better for sorting forty applicants and worse
    for acting on them, because every action meant opening the detail modal.
    Shortlist and Outreach sit on the row instead.

- **Mixlabs duplicate project.** Resolved. Two `Social Media` projects existed:
  the older `Social Media - Marketing` (5 tasks, the only staff allocations in
  the database, no deal) and a newer `Social Media` created 31 July carrying
  the ₹15,000 deal. Merged into the older one inside a single guarded
  transaction — tasks moved first, deal transferred, duplicate released from
  the deal so the delete couldn't cascade it, then deleted. Result: 8 tasks,
  2 allocations, deal attached. Every project now has a deal, and the task
  count across the database is unchanged at 16 with zero orphans.

- **Thekkan Revolution** — *open, owner to reconcile.* The CRM reads 900 AUD
  deal value with 350 AUD paid. The earlier note recording "350 AUD" was
  quoting the paid figure, not the deal value, so the comparison against
  ₹30,000 in Notion was never like for like. 900 AUD is roughly ₹49,000;
  ₹30,000 is roughly 550 AUD. Neither reconciles. Not guessed at — this is
  business data and it feeds revenue metrics.

- **Drop `@platejs/basic-styles`.** Verified unused across the whole repo
  (only `package.json` and an unrelated `components.json` registry alias
  mention Plate at all). Must be removed with `npm rm`, not by hand-editing
  `package.json` — Vercel builds with `npm ci`, which fails when the manifest
  and lockfile disagree.

### 2. Invoices as a first-class page

The gap worth closing before launch, because it's money.

`Invoice` already carries number, amount, currency, status, issue date, due
date, storage path and notes. `goals.ts` reads it for the `invoices_paid`
metric and the Organisation page pulls it for revenue. But creation and viewing
live inside a single client's portal panel, so there is no answer to the
question an agency owner asks most: *what is owed to me right now, and what's
late.*

- `/invoices` route: every invoice across every client, with status filter and
  currency toggle, on the shared `DataTable`.
- Aging view — current, 30, 60, 90+ days overdue.
- Mark paid inline, the way status editing already works in Pipeline.
- Create an invoice from a deal, carrying client, amount and currency across.
  Right now a won deal and its invoice are entered twice by hand.

### 3. Portal end-to-end pass

The only way to learn whether documents, comments, meeting requests and
messages actually work is to use them as a client, once, properly.

Provision a portal against a real client, log in as them in a private window,
and walk every path: upload a document, request a meeting, comment on a task,
approve a deliverable, send a message. Fix what breaks. This is a session of
work, not a sprint, and it's worth doing before the portal is shown to anyone
paying.

### 4. Channels

Spec in `docs/plan-channels.md`. Left last on purpose: four tables, realtime
subscriptions, unread state, threads and notification fan-out — the largest
surface in the app, and the one that most benefits from landing on a codebase
that's already been tidied.

`src/lib/useMentionables.ts` survived the Resources deletion and already
resolves `@` against real people, projects and clients, so the reference picker
is largely built.

The bar set in that plan still holds: the object linking is what justifies
building this instead of using Slack. If the linking gets cut for time, the
feature should be cut with it.
