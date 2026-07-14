# Trydent Labs CRM

A full-stack CRM built for Trydent Labs, a marketing agency. It tracks clients,
sales deals, activities, and client-facing portals, with role-based access for
admins, reps, and clients.

Stack: Next.js (App Router) + TypeScript + Tailwind CSS v4 + Supabase
(Postgres, Auth, RLS) + recharts + @dnd-kit.

## Features

- Email/password auth via Supabase, with session refresh through middleware
- Dark, green-accented UI: KPI dashboard, kanban boards with drag-and-drop,
  slide-in detail drawers, tables, and charts
- **Dashboard** — pipeline value, closed-won revenue, active clients, open
  deals, deals-by-stage donut chart, revenue-by-month bar chart, recent
  activity feed
- **Clients** — table + kanban views (grouped by status), full detail drawer
  with linked deals/activities/portal, create/edit/delete
- **Pipeline** — kanban board grouped by deal stage with drag-and-drop stage
  updates, deal value/paid/remaining, create/edit/delete
- **Activities** — table sorted by date, "assigned to me" filter, follow-up
  flag badges, create/edit/delete
- **Client Portals** — table of portal statuses linked to clients
- **Team** — directory of reps/admins; admins can change roles
- Client-role users are redirected to a simplified `/portal` view showing only
  their own client record, deals (read-only), and portal status — enforced by
  both the app layout and Postgres Row Level Security

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run the contents of `supabase/schema.sql`. This
   creates all tables, enums, RLS policies, and a trigger that auto-creates a
   `profiles` row (defaulting to role `rep`) whenever someone signs up.
3. In **Authentication → Users**, create your own user (or sign up from the
   app's `/login` page once it's running — note the login page only supports
   sign-in, so for the very first user you'll need to create it directly in
   the Supabase dashboard, or add a temporary sign-up flow).
4. Promote yourself to admin by running this in the SQL editor:

   ```sql
   update profiles set role = 'admin' where email = 'you@example.com';
   ```

5. Optionally create more users, then link `client`-role users to a specific
   client record:

   ```sql
   update profiles set client_id = '<clients.id>' where email = 'client@company.com';
   ```

## 2. Configure environment variables

Copy the example file and fill in your project's credentials (found in
Supabase → Project Settings → API):

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The app is guarded to build and render even without these set (useful for
previews), but sign-in and all data features require real credentials.

## 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/dashboard`, which redirects
to `/login` if you're not signed in.

## 4. Deploy to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com), click **New Project** and import the repo.
3. In the project's **Settings → Environment Variables**, add the same three
   variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Vercel will run `npm run build` automatically.
5. To use trydentlabs.com, go to the project's **Domains** settings in
   Vercel, add `trydentlabs.com`, and update your domain's DNS records
   (Vercel will show you the exact A/CNAME records to add) at your domain
   registrar.

## Project structure

- `src/app` — App Router pages, grouped under `(dashboard)` for the
  authenticated staff shell (sidebar + topbar), plus `/login` and `/portal`
  (client-facing view)
- `src/components` — feature components: `Sidebar`, `Topbar`, `DataTable`
  (generic table), `KanbanBoard` (generic drag-and-drop board)
- `src/components/ui` — primitives: `Button`, `Card`, `Badge`, `Drawer`,
  `Input`, `Select`, `StatCard`, `Avatar`
- `src/lib/supabase` — browser/server Supabase client factories, both
  guarded against missing env vars
- `src/lib/types.ts` — TypeScript types mirroring `supabase/schema.sql`
- `src/middleware.ts` — refreshes the Supabase session cookie on each request
- `supabase/schema.sql` — full Postgres schema, RLS policies, and triggers
