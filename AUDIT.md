# Trydent Labs CRM — Code & Security Audit

Date: 27 July 2026 · Scope: all of `src/` and `supabase/` · Method: static review of
every non-vendored source file, all 24 migrations, `schema.sql`, both API routes and
the middleware.

**Codebase size:** ~37,000 lines total, of which **18,900 are vendored** (`components/charts`,
`components/shadcn`). Your own code is ~18,100 lines across 90 files. That is a healthy
ratio and the code is, on the whole, in good shape: types are strict, there are no `any`
casts, no `dangerouslySetInnerHTML`, no stray `console.log`, and both privileged API routes
verify the caller is an admin before touching the service-role key.

The findings below are ordered by how much they matter, not by how easy they are.

---

## 1. Security

### S1 · CRITICAL — clients can read your internal meeting notes

**Where:** `activities` table RLS.

Two SELECT policies exist for the client role:

| Policy | Source | Condition |
|---|---|---|
| `activities_client_select_own` | `schema.sql` / original migration | `role = 'client' AND client_id = current_client_id()` |
| `activities_client_select` | `2026-07-26d_meetings.sql` | `role = 'client' AND client_visible = true AND client_id = current_client_id()` |

**Postgres ORs multiple permissive policies together.** A row only has to satisfy *one*
of them. The old policy has no `client_visible` check, so it matches every activity
belonging to that client and the new restriction is bypassed entirely.

**Impact:** any portal client can query `activities` directly through the Supabase JS
client and read every internal call, its agenda, and its private `notes` field for their
account. The portal UI hides them; the API does not. This is the most serious issue in
the codebase.

**Cause:** my Phase 5 migration added a tighter policy without dropping the looser one.
That was my error.

**Fix:** drop `activities_client_select_own`. One line.

---

### S2 · HIGH — RLS helper functions are vulnerable to search-path hijacking

**Where:** `schema.sql`, `current_role_name()` and `current_client_id()`.

```sql
create or replace function current_role_name()
returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;
```

Both run `security definer` with **no `set search_path`**. A `security definer` function
without a pinned search path executes with the definer's privileges while resolving
object names using the *caller's* search path. A user who can create objects in a schema
earlier on that path can shadow `profiles` and make these functions return whatever they
like — including `'admin'`.

These two functions are the foundation of every RLS policy in the database. If they can
be fooled, the entire authorisation model can be.

Your newer functions (`notify_staff`, `on_portal_message`, `seed_onboarding_tasks`,
`on_meeting_request`, `enforce_single_default_template`) all correctly set `search_path`.
The two oldest and most important ones do not.

**Fix:** add `set search_path = public` to both. Two lines.

---

### S3 · HIGH — profile visibility depends on one migration having been run

`2026-07-26c_team_directory.sql` drops `profiles_select_all` (which allowed *any*
signed-in user to read *every* profile row, including other clients' portal users and
their email addresses) and replaces it with staff-only plus self-only policies.

`schema.sql` still contains the permissive version. If that migration hasn't been applied
to production, the leak is live. If it has, `schema.sql` is now lying about the state of
the database.

**Fix:** confirm the migration ran, then reconcile `schema.sql` (see M1).

---

### S4 · MEDIUM — the database disagrees with the UI about what reps can see

`src/lib/permissions.ts` hides Goals, Recruiting, Onboarding and contractor pay from the
rep role. The RLS policies do not:

| Table | Policy grants |
|---|---|
| `goals`, `key_results` | `admin`, `rep` |
| `applicants` | `admin`, `rep` |
| `onboarding_*` | `admin`, `rep` |
| `staff_payments` | `admin`, `rep` |

A rep who opens devtools, or simply types `/goals`, is stopped by the UI guard — but a rep
who calls the Supabase client directly is not. As I flagged when building it, the
permissions module is navigation shaping, not security.

**How much this matters depends on your threat model.** If reps are trusted colleagues and
this is about tidiness, leave it. If contractor pay is genuinely confidential, tighten the
four policies to `'admin'` only.

---

### S5 · MEDIUM — two tables are world-readable to every signed-in user

```sql
create policy "teams_read" on teams for select using (true);
create policy "app_settings_read" on app_settings for select using (true);
```

`using (true)` means portal clients and contractors can enumerate your internal team
structure and read your base-currency setting. Low severity — team names aren't secrets —
but `using (true)` on any table deserves a deliberate decision rather than a default.

**Fix:** scope both to `current_role_name() <> 'client'`, or accept and document.

---

### S6 · LOW — portal username suffix uses `Math.random()`

`ClientPortalPanel.tsx` line 119 appends a two-digit `Math.random()` suffix when a
username collides. Not security-critical (usernames aren't secrets and passwords are set
separately), but it's a predictable PRNG in an identity path. `crypto.getRandomValues`
costs nothing extra.

Worth noting the surrounding design is **correct**: passwords are never stored, only
reset-to-reveal, and the service-role key stays server-side. That was the right call.

---

### S7 · LOW — one external link missing `rel="noopener"`

8 of 9 `target="_blank"` links carry `rel`. One doesn't. Modern browsers imply
`noopener` for `target="_blank"`, so this is hygiene rather than exposure.

---

### What's already right

Worth stating plainly, because these are the things that usually go wrong:

- **Service-role key handling is correct.** Both `/api/portal-users` and `/api/team-users`
  authenticate the caller and check `profile.role === 'admin'` *before* instantiating the
  privileged client. The key is read from server-only env and never reaches the browser.
- **No secrets in the repo.** `.env*.local` is gitignored; no keys are hardcoded.
- **Middleware routes by JWT metadata for speed but the layout re-checks authoritatively**,
  so stale metadata can't grant access.
- **`/api/fx` validates its input** against an allowlist before interpolating into a URL.
- **No XSS surface.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`.
- **Client-insert policies are properly constrained** — `portal_messages`,
  `task_comments` and `meeting_requests` all check `author_id = auth.uid()` *and* client
  ownership, so a client can't post as someone else or into another account.

---

## 2. Performance

### P1 · HIGH — every page loads every row of every table it touches

`useSupabaseTable` does `select("*")` with no limit, no column projection and no filter.
There are 24 such calls. Some are load-bearing problems:

- **`/portal` fetches the entire `project_tasks` table** (line 163) and filters to the
  client's projects in JavaScript. RLS means a client only receives their own rows, so
  this isn't a leak — but for staff previewing a portal it pulls every task in the
  business.
- **`/goals` and `/organization` each load 6–8 complete tables** to compute a handful of
  aggregate numbers.
- **`/projects/[id]` makes 12 table reads** on mount.

Today, with a handful of clients, this is invisible. At a few thousand rows it becomes a
slow first paint on every page; at tens of thousands it becomes a real problem.

**Fix, in order of value for effort:**
1. Add a `filter` option to `useSupabaseTable` and scope the obvious ones
   (`project_tasks` by project, `activities` by client).
2. Add `limit` + column projection where the full row isn't needed.
3. Only then consider pagination.

### P2 · MEDIUM — the same tables are refetched on every page

Across the app: `clients` is loaded 8 times, `project_tasks` 6, `deals` 6, `profiles` 5.
Each is a separate network round-trip on each page mount, with no shared cache. Navigating
Clients → Pipeline → Projects refetches `clients` three times.

**Fix:** a small module-level cache with a TTL inside `useSupabaseTable`, or adopt
TanStack Query. The hook is the only place that needs changing, which makes this cheap.

### P3 · MEDIUM — three foreign keys have no index

| Column | Used by |
|---|---|
| `project_tasks.assigned_to` | My Work, every assignee filter |
| `activities.assigned_to` | Schedule "mine" tab |
| `notifications.recipient_id` | The bell, polled every 60s by every open tab |

`notifications.recipient_id` is the one that will bite first, because it's on a timer.
40 indexes already exist; these three were missed.

### P4 · LOW — notification polling

`NotificationsBell` polls every 60 seconds per open tab. With browser tabs left open all
day that's ~1,400 queries per user per day against an unindexed column. Supabase Realtime
would remove the polling entirely, or at minimum add the index from P3 and back off when
the tab is hidden.

---

## 3. Maintainability

### M1 · HIGH — `supabase/schema.sql` is 13 tables behind

Missing entirely: `portal_updates`, `task_comments`, `notifications`, `portal_messages`,
`client_documents`, `invoices`, `goals`, `key_results`, `applicants`,
`onboarding_templates`, `onboarding_template_items`, `onboarding_tasks`,
`meeting_requests`.

Deployment runs off the migration files, so nothing is broken today. But `schema.sql`
claims to be the consolidated truth and isn't — a fresh install from it produces an app
that immediately crashes, and (per S3) it documents a security policy that no longer
exists. It's now actively misleading rather than merely stale.

**Fix:** regenerate it from the live database rather than hand-patching.

### M2 · MEDIUM — five files are too large to reason about

| File | Lines |
|---|---|
| `projects/[id]/page.tsx` | 1,684 |
| `portal/page.tsx` | 1,305 |
| `schedule/page.tsx` | 1,284 |
| `ClientPortalPanel.tsx` | 967 |
| `recruiting/page.tsx` | 961 |

`projects/[id]` alone holds the header, four view modes, a mini calendar, a Gantt strip,
a task board and two modals. Every one of those is independently testable and none of them
share state beyond props.

I'd extract in this order, highest pain first: the project page's calendar and timeline
into `components/project/`, then the portal's sections, then the schedule's week and month
grids. This is refactoring with no user-visible change, so it can happen whenever there's
a quiet session.

### M3 · LOW — dead files

- `src/components/ClientDetailDrawer.tsx` — a 266-byte tombstone. The sandbox can't delete
  files; you can.
- `supabase/migrations/2026-07-19_portal_password_visibility.sql` — a cancelled no-op.
- `tsconfig.tsbuildinfo` is **tracked in git**. It's a 308 KB build artefact that changes
  on every compile and creates noise in every diff. Add to `.gitignore` and
  `git rm --cached`.

### M4 · LOW — naming that no longer matches behaviour

`components/ui/Drawer.tsx` renders a centred modal. Documented in the file, but a new
reader will be briefly confused. Rename when something else touches those imports anyway.

### M5 · INFO — dependencies are clean

No unused packages. `recharts` was properly removed after the chart migration. `lodash`
was never added. Every dependency in `package.json` is imported somewhere.

---

## 4. Recommended order of work

| # | Item | Severity | Effort |
|---|---|---|---|
| 1 | S1 — drop the stale `activities` client policy | Critical | 1 line |
| 2 | S2 — pin `search_path` on the two RLS helpers | High | 2 lines |
| 3 | S3 — confirm `26c` ran in production | High | 5 minutes |
| 4 | P3 — add the three missing indexes | Medium | 3 lines |
| 5 | S4 — decide whether reps are trusted, then align RLS | Medium | Decision + ~10 lines |
| 6 | M1 — regenerate `schema.sql` | High (latent) | One session |
| 7 | P1/P2 — filters and caching in `useSupabaseTable` | Medium | One session |
| 8 | M3 — delete dead files, untrack `tsbuildinfo` | Low | 5 minutes |
| 9 | M2 — split the five large files | Low | Two or three sessions |

Items 1 through 4 are a single migration and can ship in one push. I'd do that before
anything else.

---

## 5. Overall assessment

For a codebase built this fast, this is in better shape than most. Strict TypeScript with
zero escape hatches, a real design system rather than ad-hoc styling, RLS on every table
rather than trusting the client, and privileged operations correctly gated behind
server-side admin checks.

The weaknesses are the ones speed produces: a schema file that drifted, page components
that accreted rather than being designed, and queries written for correctness rather than
scale. None of those are structural. They're all reversible in an afternoon each.

The one genuine defect is S1, and it exists because a migration added a rule without
removing the rule it superseded — which is exactly the failure mode a drifted `schema.sql`
makes harder to catch. Those two findings are the same problem wearing different clothes.
