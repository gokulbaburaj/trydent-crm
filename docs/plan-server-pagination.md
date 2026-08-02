# Server-side pagination — deferred, with a trigger

**Status: not built, on purpose.** Written 2 Aug 2026 after measuring rather
than assuming.

## The measurement

```
deals          26 rows   112 kB
clients        22 rows    64 kB
project_tasks  13 rows   128 kB
projects       10 rows   144 kB
```

Largest table in the database is 26 rows. `useSupabaseTable` fetches whole
tables and filters in the browser, and at this size that is not a compromise —
it is the faster design. One cached round trip, then filtering, sorting and
saved views run instantly with no network in the loop.

## Why half-doing it is worse than not doing it

The tempting increment is to add `.range()` to `useSupabaseTable` and page the
query. **Don't.** Filtering, sorting and search are all client-side today
(`lib/filters.ts`, `DataTable`'s `sortKey`). Page the fetch without moving
those, and every filter silently applies to the loaded page only — a search
that finds nothing because the match is on page 3 is worse than a slow page,
because it looks like an answer.

So the real change is all of this together:

1. **Filters to the server.** `applyFilters` becomes a query builder:
   `.ilike()` for text, `.in()` for facets, `.gte()/.lte()` for date ranges.
2. **Sorting to the server.** `Column.sortKey` is a client function today, and
   some are computed (`toBase()` for mixed currencies on Pipeline). Those need
   either a generated column or a view.
3. **Count for the footer.** `select("*", { count: "exact" })` — or
   `planned` if exact gets slow.
4. **Pagination state into the URL**, so a filtered page is linkable and the
   back button behaves.
5. **Debounced search**, since every keystroke becomes a request.
6. **The cache changes shape.** It's keyed by table today; it would have to be
   keyed by table + filters + sort + page, and stale-while-revalidate across
   pages gets its own set of decisions.

That's a real piece of work across five list pages, `FilterBar`, `DataTable`
and the cache — for tables with 26 rows.

## The trigger

`useSupabaseTable` now warns in development the first time any table returns
**1,000 rows or more**:

```
[useSupabaseTable] "deals" returned 1043 rows and is fetched whole on every
page that uses it. Past ~1000 rows this needs server-side pagination — and
filtering and sorting have to move with it, or filters will silently apply to
one page.
```

Dev-only, once per table per session. The point is that you find out from a
console you're already looking at, rather than from someone saying the app got
slow.

1,000 is where the trade inverts for tables of this shape — a few hundred bytes
a row, rendered fifteen at a time. Revisit the number if rows get much fatter;
a table with a large `jsonb` column hurts sooner. `resources.content` is the
one to watch, since a long note is orders of magnitude bigger than a deal row.

## What to do when it fires

Do the six items above **in one change, for one page first** — Pipeline is the
right pilot: it has the most rows, the most filters, and the currency-converted
sort that will expose the hardest part. Get that correct, then roll the pattern
outward. Do not part-migrate a page.
