# Editor

Everything the note editor is made of. Plate (Slate/ProseMirror) lives here so
`components/shadcn` can go back to holding shadcn primitives and nothing else —
before this split it held 76 files, of which 52 were Plate.

```
editor/
  plugins/        plugin kits. note-editor-kit.tsx is the one we assembled;
                  the rest arrived from the registry.
  ui/             node and toolbar components (headings, callouts, tables,
                  mentions, drag handles, slash menu).
  transforms.ts   block conversions used by the slash menu and context menu.
  suggestion.ts   styling shared by suggestion marks.
```

## Adding more Plate features later

`npx shadcn@latest add @plate/<kit>` writes into the `ui` alias from
`components.json`, which is `src/components/shadcn`. **New Plate files will
therefore land in the wrong folder.** After any Plate install:

1. Move the new Plate files into `editor/ui/` (they're the ones importing
   `platejs` or `@platejs/*`).
2. Rewrite `@/components/shadcn/<name>` imports to `@/components/editor/ui/<name>`.
3. Repoint any relative `./toolbar`, `./context-menu` etc. to
   `@/components/shadcn/<name>` — those primitives stay put.

Annoying, and worth it: the alternative is one folder where you can't tell your
components from the vendor's.

## What's deliberately not enabled

See the comment block in `plugins/note-editor-kit.tsx`. Short version: media,
comments, AI and drawing plugins are installed-but-unused or absent on purpose.
`transforms.ts` had its code-drawing and Excalidraw inserters removed with their
imports — re-add both together if you turn those on.
