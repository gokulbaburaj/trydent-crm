# Trydent Labs CRM — Project Handoff

Paste this whole document as your first message in the new session so Claude has full context immediately.

## What this is

A full-stack CRM web app for Trydent Labs, a marketing agency, built to replace the owner's Notion-based CRM. It's a real deployable app — not a mockup — hosted on Vercel, backed by Supabase, connected to GitHub for auto-deploy on push.

**Stack:** Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS v4 + Supabase (Postgres/Auth/RLS), deployed on Vercel.

**Domains:** `trydentlabs.com` is reserved for a future marketing/portfolio site (not touched yet). `traid3nt.xyz` (bought via Hostinger) is intended for the CRM itself — domain connection was started in Vercel once but the user paused it ("let's do the domain connection later"). Don't resume unless asked.

## Where the files live

- Real project folder (what the user sees in Finder, what gets committed to git): `/Users/gokulbaburaj/Desktop/CoWork OS/trydent-crm`
- That same folder is reachable from the sandbox shell at: `/sessions/<session-id>/mnt/CoWork OS/trydent-crm` — direct bash access works fine (confirmed: `ls`, `npx tsc --noEmit`, `npx eslint .` all run cleanly against the real folder without any copy step). `npm run build` fails in the sandbox with a `fetch failed / EAI_AGAIN registry.npmjs.org` error because the sandbox can't download the missing arm64 swc binary — this is a sandbox networking limitation, not a code problem. Rely on `tsc --noEmit` + `eslint .` for verification instead.
- The user runs all `git add/commit/push` commands themselves in their own Terminal — an agent should give exact copy-paste commands each time rather than trying to run git operations against the real repo.

## User context — read this before doing anything

- Gokul has limited technical/terminal experience. Give exact copy-paste commands, explain each step in plain language, and don't assume familiarity with standard dev workflows.
- He owns the Supabase project and Vercel deployment already; both are live and working.
- Known one-time environment fixes already applied (don't need to redo, but useful if similar errors resurface):
  - macOS Terminal needed Full Disk Access / Files-and-Folders permission for the Desktop folder (fixed via System Settings → Privacy & Security).
  - `next.config.ts` has `turbopack: { root: path.resolve(__dirname) }` pinned — without it, Turbopack misdetects the project root because of multiple lockfiles on disk and tries to scan the whole home folder, hitting the permissions wall again.
  - The Supabase `handle_new_user()` trigger function required explicit schema-qualification (`public.user_role`, `public.profiles`) and `set search_path = public` because Supabase runs auth triggers with a restricted search path. This fix was applied live in the Supabase SQL editor but **`supabase/schema.sql` in the repo was never updated to match** — worth reconciling at some point so a fresh `schema.sql` deploy wouldn't reintroduce the bug.

## Data model / modules built so far

Roles: `admin`, `rep` (internal team), `client` (locked to their own portal view) — enforced via Postgres RLS policies using `current_role_name()` / `current_client_id()` helper functions, and app-level routing (client-role users get redirected to `/portal`).

Tables: `profiles`, `clients`, `deals`, `activities` (now branded "Schedule" in the UI, table name unchanged), `client_portals`, `projects`.

Pages/modules, all under `src/app/(dashboard)/`:
- `dashboard` — KPI stat cards, deals-by-stage donut, revenue-by-month bar chart, "Upcoming Schedule" card
- `clients` — table + kanban toggle view, detail drawer, linked deals/activities/portal shown in drawer
- `pipeline` — kanban board (drag-and-drop via `@dnd-kit`), deal detail drawer
- `projects` — grouped-by-client accordion layout (mirrors the user's Notion structure where each client has its own project space)
- `schedule` — renamed from "Activities"; has All/Mine/Calendar tabs, calendar view built with `date-fns` (month grid, event dots, day click-to-filter, upcoming list). `/activities` route now just redirects to `/schedule` to keep old links alive.
- `portals` — client portal status tracker
- `team` — team directory, admin-only role editing
- `settings` — profile + env status
- `portal` — the client-facing view (what `client`-role users see instead of the full dashboard)

Not yet built (from the user's original "Internal Hub" wishlist, explicitly deprioritized/deferred): team docs, social media calendar, applicant tracker, job board (internal-only when built), kanban view for deliverables.

## Design system — this is the part most likely to need continued iteration

This went through several rounds this session and the user was specific that they want it to look **exactly** like their own Linear workspace (they use Linear for project management and love its look), not a generic "Linear-inspired" theme.

**Current state (latest, in `src/app/globals.css`):**
```css
--background: #08090a;       /* near-pure black, used for both page bg AND sidebar/topbar — no visible seam */
--surface: #131316;          /* solid elevated surfaces: Card, Input, Select, dropdown-like elements */
--border: #1c1c1f;
--border-subtle: #17171a;    /* row dividers inside tables */
--foreground: #f7f8f8;
--foreground-secondary: #d4d4d8;
--muted: #6e6e76;
--muted-2: #55555c;
--accent: #22c55e;           /* kept Trydent's green rather than switching to Linear's purple #5E6AD2 — flagged this as a judgment call, not confirmed with user which they'd prefer */
--accent-foreground: #052e12;
--danger: #eb5757;
--warning: #f2994a;
```

Font: Inter, loaded via `next/font/google` in `src/app/layout.tsx` with `variable: "--font-inter"`. **Important gotcha:** the Tailwind `--font-sans` theme token in `globals.css` references `var(--font-inter)`, NOT `var(--font-sans)` directly — naming it the same thing created a circular CSS variable reference that silently broke the font. Keep the names distinct if touching this again.

**Interaction states use white-opacity overlays, not solid gray tokens** — e.g. `hover:bg-white/5`, active/selected: `bg-white/10`. This was a late but important correction: earlier passes used fixed hex tokens like `--surface-hover` / `--surface-raised`, which were removed entirely from the theme in favor of `bg-white/[x]` utilities applied inline, because the user's actual live Linear screenshots showed sidebar and content are the same color with translucent-white interaction states, not a distinct "raised surface" gray.

Border radius: tight, 4px (`rounded`, not `rounded-md`/`rounded-lg`/`rounded-full`) across buttons, inputs, badges, cards — matches Linear's compact corner radius. Circles (avatars, status dots) are the exception and stay `rounded-full`.

**Design research trail (useful if picking this up again):**
1. First pass used my own general knowledge of Linear's look — user said this wasn't matching.
2. Pulled real tokens from a "Linear Design System" community Figma file the user connected (fileKey `JQAZHYnv9J4Qz2TZ3xBFSq`) via the Figma MCP (`get_design_context`, `get_metadata`) — got literal hex values (`#181921` bg, `#191a23` sidebar, `#2c2d3c` border, etc.). This is a real published source but the user said it still felt like "the older version."
3. User then sent several actual production screenshots from Linear's own "How we redesigned the Linear UI" blog post, plus a real screenshot of **their own live Trydent Labs Linear workspace** (this is the most authoritative reference — it's not a mockup, it's their actual account). That screenshot showed: true near-black background with zero visible separation between sidebar and main content; nav active-state as a soft translucent highlight, not a solid gray box; icons/text for inactive top-level items stay fairly bright (not heavily dimmed); workspace switcher row at the very top of the sidebar with a colored icon + name + chevron, search + compose icon buttons to its right; grouped sections lower down ("Workspace ▾", "Your teams ▾", "Try ▾") with a small chevron after each label.
4. Rebuilt the whole token system around white-alpha overlays based on that — this is the current state described above.
5. **Claude in Chrome was never successfully connected in this session** (user offered twice, extension kept reporting "not connected") — if it connects in the new session, the single most useful thing to do is navigate to the user's actual `linear.app` workspace and read the live computed CSS custom properties via `javascript_tool` (e.g. `getComputedStyle(document.documentElement)` or inspecting Linear's own CSS variables if exposed) — that would replace every color guess in this doc with ground truth. Chrome extension install link: https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn

**Components that carry the design system** (all in `src/components/` and `src/components/ui/`): `Sidebar.tsx`, `Topbar.tsx`, `DataTable.tsx`, `KanbanBoard.tsx`, `Card.tsx`, `Badge.tsx`, `Button.tsx`, `Input.tsx`, `Select.tsx`, `Drawer.tsx`, `StatCard.tsx`, `Avatar.tsx`. All pages under `(dashboard)/` consume these rather than hardcoding styles, so token/component changes should propagate automatically — but a few pages (clients, schedule, projects) have some inline Tailwind classes for tab toggles and kanban cards that were manually kept in sync with the token renames each round; worth grepping for stray `surface-hover`/`surface-raised`/`rounded-xl`/`rounded-2xl`/`rounded-full` (on non-circular elements) if the theme changes again, since Tailwind v4 silently no-ops on undefined theme tokens rather than erroring.

## Standing workflow for any future change

1. Edit files directly at the real path via Read/Write/Edit tools.
2. Verify with `cd "/sessions/.../mnt/CoWork OS/trydent-crm" && npx tsc --noEmit && npx eslint .` (both should output nothing / exit clean).
3. Give the user exact `git add -A && git commit -m "..." && git push` commands — they run these themselves, Vercel auto-deploys on push.
4. Don't attempt `npm run build` in the sandbox for verification — it fails on network grounds unrelated to code correctness.
