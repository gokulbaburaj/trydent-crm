-- Trydent Labs CRM — block content for resource notes
--
-- Notes move from a markdown textarea to a Notion-style block editor
-- (BlockNote, built on ProseMirror). Block editors don't work in markdown —
-- they work in a JSON block tree — so the storage has to follow.
--
-- Two columns, one truth
-- ----------------------
--   content  jsonb  — the block tree. SOURCE OF TRUTH. What the editor loads
--                     and saves. Lossless: callouts, toggles, tables, nesting.
--   body     text   — an auto-generated markdown MIRROR. Never edited by hand
--                     after this migration, never read back into the editor.
--
-- Why keep `body` at all, given it's derived: the full-text index is built on
-- it. `to_tsvector` over a jsonb block tree would index the structural keys —
-- "type", "paragraph", "styles" — alongside the words, and every note would
-- match a search for "text". Flattening to markdown on save keeps search
-- indexing prose and nothing else.
--
-- The conversion is lossy in one direction only, and deliberately so. A
-- callout flattens to a blockquote in the mirror. That's fine: the mirror
-- exists to be searched, not to be read. Nothing ever reconstructs a note
-- from it.
--
-- `body` also stays NOT-NULL-ish via the existing shape constraint, which
-- means an empty-but-valid note keeps working and old clients that only know
-- about markdown still render something sensible.
--
-- Migration path for existing notes: none needed here. `content` starts null,
-- and the editor parses the existing markdown into blocks the first time a
-- note is opened, then saves. No bulk backfill, no downtime, and a note nobody
-- opens costs nothing.
--
-- Run in the Supabase SQL editor. Safe to re-run.


alter table public.resources
  add column if not exists content jsonb;

comment on column public.resources.content is
  'BlockNote block tree — the source of truth for note bodies. Null means the '
  'note predates the block editor; it is parsed from body on first open.';

comment on column public.resources.body is
  'Markdown MIRROR of content, regenerated on every save. Exists so the '
  'full-text index has prose to chew on; never read back into the editor.';


-- The shape constraint predates the block editor and still holds: a note needs
-- a body, a link needs a url. `body` is now generated rather than typed, but
-- it is still always present for a note, so the rule is unchanged and there is
-- nothing to relax.


-- ============================================================================
-- Verify
-- ============================================================================
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'resources'
--     and column_name in ('content', 'body');
--   -- expect: body text, content jsonb
--
--   -- After opening a note in the app, its blocks should have landed:
--   select title, content is not null as has_blocks, left(body, 60) as mirror
--   from public.resources where kind = 'note';
