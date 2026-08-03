# Working agreement

Read this before doing anything. It's the stuff that isn't in the code.

## Who runs what

**Gokul runs every git command himself.** Never run `git` — not add, not commit,
not push, not checkout. When work is finished, hand him the command to paste.

**End every piece of work with the command, unasked.** Don't wait to be prompted
for it. The shape:

```
npm run build && git add -A && git commit -m "<message>" && git push
```

Include `npm rm <pkg>` or `npm install` at the front when dependencies changed —
Vercel builds with `npm ci`, which fails if `package.json` and the lockfile
disagree, so a hand-edited manifest breaks the deploy.

If a Supabase migration is part of the change, say so in the same breath and
name the file.

## What the agent sandbox can't do

- **Can't delete files.** `rm` fails with "Operation not permitted". `mv` works,
  so renames are fine. Anything needing a real delete goes to Gokul.
- **Can't `npm install`.** No network for it.
- **Can't `npm run build`.** The Turbopack native binary can't be fetched
  (`EAI_AGAIN`). So the build is never verified from this side — say so rather
  than implying it passed.
- **Can** run `npx tsc --noEmit`, `npx eslint` and `npm test`. All three must be
  clean before handing anything over. tsc and eslint take ~30s; the bash tool
  caps at 45s, so run them in separate calls. `npm test` is under a second.

## Database

Supabase project `kpaiqnbnjgxtpaggyxht`, and the MCP tools write to
**production**. There is no staging.

- Migrations live in `supabase/migrations/`, named `YYYY-MM-DD<letter>_slug.sql`.
- Write the file first, then apply it, then verify with a query. Keep the file
  and the applied state identical — if a fix is needed after applying, patch
  both.
- Say plainly what was run against production.
- Guard destructive migrations with a row-count check that raises rather than
  proceeding on surprising data.

## Verification, not assertion

The recurring failure on this project has been claiming things without checking.
Concretely:

- Before removing a package, grep for what actually imports it — including
  `globals.css`, which has bitten this twice (`remark-gfm`,
  `tailwind-scrollbar-hide`).
- Before "fixing" a UI element, read it. Several roadmap items dissolved on
  inspection because the thing described didn't exist or was deliberate.
- Test RLS with forged JWTs per role, not by clicking around. The pattern is in
  `docs/plan-channels.md` and it has caught real bugs.
- Pure logic (date maths, parsers) gets a test, not a throwaway script. There
  is a suite now — `npm test`, Node's built-in runner, no dependencies. Files
  are `src/lib/*.test.ts` and import with an explicit `.ts` extension because
  type stripping needs it (`allowImportingTsExtensions` is on for this reason).
  This caught an off-by-one in overdue days, a regex where `^` matched every
  string, and `initials("   ")` returning an empty avatar.
- **Anything moved out of a page for testing stays behaviour-identical.** The
  calendar packing in `lib/calendarLayout.ts` was lifted out of the schedule
  page unchanged; the page keeps a thin adapter. Don't fix and extract in the
  same move — you lose the ability to tell which one broke it.

If something can't be verified from here, say which part is unverified.

## Style

- Comments explain **why**, especially where the obvious approach was rejected
  and why. Don't narrate what the code already says.
- Push back with reasoning when something looks wrong. Gokul would rather be
  told than handed what he asked for.
- Prose: direct, no filler, no "X isn't just about Y" constructions, no
  corporate register.

## Standing gotchas

- **Never run `npm audit fix --force`.** As of 3 Aug 2026 it proposes
  installing `next@9.3.3` — a six-major-version downgrade from 16.2.12 —
  because that's the only release whose ranges satisfy the postcss and sharp
  advisories. It would destroy the app. Plain `npm audit fix` is safe.
  The four current high-severity findings are all unreachable: `sharp` is only
  invoked by `next/image` and there are zero `next/image` imports; `postcss`
  runs at build time over CSS we wrote; `brace-expansion` sits inside
  `@typescript-eslint`, a devDependency. postcss and sharp are Next's own
  transitive deps — they clear when Next ships a patch, not from our manifest.
- **Portals and modal scroll locks.** Radix portals to `<body>`, which is
  outside the scroll lock a modal dialog installs (`react-remove-scroll`). Wheel
  events get swallowed while pointer drags still work. Floating elements inside
  a Drawer must render in normal flow — see `components/ui/TimePicker.tsx`.
- **`useCurrency`'s helpers are memoised, and that is load-bearing.** Rates
  arrive after first paint; until they do `toBase` returns amounts unconverted.
  If `toBase` were a fresh closure per render, a caller's `useMemo` could
  either recompute every render or never correct itself — Dashboard and
  Pipeline took the second option behind an `exhaustive-deps` suppression, and
  multi-currency totals were summed at 1:1 forever. Don't un-memoise them, and
  do list them in dependency arrays rather than silencing the lint.
- **`react-hooks/set-state-in-effect`.** Don't reset state in an effect. Derive
  during render, keeping the key the state belongs to inside the state itself —
  `lib/useChannel.ts` shows the pattern.
- **Collapse animations** use a single-row grid, `grid-rows-[0fr]` to
  `grid-rows-[1fr]`, with `overflow-hidden` inside. Height can't transition from
  `auto` and measuring content breaks when the content changes.
- **`useSupabaseTable` fetches whole tables.** Fine for deals and clients, wrong
  for anything unbounded. `messages` uses cursor pagination in
  `lib/useChannel.ts`.
- **`isPortalOnly` is derived**, not stored. Granting an ordinary page to a
  portal-only role silently promotes those people into the full app. Pages that
  everyone needs go in `PORTAL_COMPATIBLE` in `lib/permissions.ts`.
- **UI permission checks must match RLS.** A `PageKey` the database doesn't
  enforce is decoration. `/invoices` rides on the `clients` grant for exactly
  this reason.

## Where things are written down

- `docs/punchlist-2026-08-03.md` — current open items
- `docs/plan-channels.md` — chat feature, what's built and what isn't
- `docs/plan-next.md` — roadmap and the reasoning behind each call
- `docs/portal-walkthrough.md` — client portal test script, needs a browser
- `AUDIT.md` — dated 27 July, historical; don't edit it to match the present
