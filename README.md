# Trydent Labs CRM

A full-stack CRM built for Trydent Labs, a marketing agency. It tracks clients,
sales deals, projects with tasks, a schedule calendar, and client-facing
portals — with role-based access for admins, reps, and clients.

**Live:** [traid3nt.xyz](https://traid3nt.xyz)

## Stack

- **Next.js 16** (App Router) + TypeScript (strict)
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives, sonner toasts, cva variants)
- **Supabase** — Postgres, Auth, Row Level Security
- **Vercel** — auto-deploys on push to `main`
- dnd-kit (drag & drop), Recharts (charts), date-fns

## Modules

- **Dashboard** — KPI cards, deals donut, monthly revenue chart (theme-aware)
- **Clients** — table/kanban, inline status editing, tags, linked deals & activities
- **Pipeline** — drag-and-drop deal stages with per-column totals and a
  multi-currency display toggle (USD/INR/EUR/CAD/AUD/AED)
- **Projects** — per-project dashboard (progress ring, task checklist, mini
  calendar, meetings, Gantt-style timeline with movable/resizable cards),
  Kanban/List/Calendar task views, task details with deliverable links,
  labels, and subtask boards
- **Schedule** — week time-grid and month calendars; activities, task due
  dates, and project deadlines all shown; drag to reschedule; right-click to
  recolor events
- **Client Portals** — per-client portal with auto-generated username logins,
  admin preview, and last-opened tracking
- **Team / Settings** — role management, theme accent picker, ⌘K command menu

## Local development

```bash
npm install
npm run dev
```

Environment variables (`.env.local` / Vercel): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server-only;
required for portal login creation).

## Database

`supabase/schema.sql` is the consolidated schema for a **fresh** project.
Existing databases evolved through `supabase/migrations/*` — run new migration
files in the Supabase SQL editor as they appear.

## Design system

shadcn/ui dark theme (neutral base) with a Linear-inspired shell: sidebar +
browser-style tabs + rounded canvas. The brand color is user-adjustable from
Settings and drives shadcn's `--primary` token. Components installed via the
shadcn CLI live in `src/components/shadcn/`; app-level wrappers in
`src/components/ui/` adapt them to historical prop names.
