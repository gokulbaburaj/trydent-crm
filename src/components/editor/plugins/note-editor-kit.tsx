"use client";

import { TrailingBlockPlugin } from "platejs";

import { BasicBlocksKit } from "./basic-blocks-kit";
import { BasicMarksKit } from "./basic-marks-kit";
import { BlockMenuKit } from "./block-menu-kit";
import { CalloutKit } from "./callout-kit";
import { CodeBlockKit } from "./code-block-kit";
import { ColumnKit } from "./column-kit";
import { DndKit } from "./dnd-kit";
import { IndentKit } from "./indent-kit";
import { LinkKit } from "./link-kit";
import { ListKit } from "./list-kit";
import { MarkdownKit } from "./markdown-kit";
import { MentionKit } from "./mention-kit";
import { SlashKit } from "./slash-kit";
import { TableKit } from "./table-kit";
import { TocKit } from "./toc-kit";
import { ToggleKit } from "./toggle-kit";

/**
 * The plugin set for resource notes.
 *
 * Chosen, not exhaustive. Plate ships 40-odd plugins and turning them all on
 * gives you a slash menu with sixty entries nobody scrolls — which is the
 * opposite of usable. This is the set an SOP or a process note actually
 * reaches for.
 *
 * Deliberately absent, and why:
 *
 *   media / images   — needs a Storage bucket, and files were cut from v1.
 *   comments         — a second data model to build and secure. Later.
 *   AI               — needs a key and a server route.
 *   math, excalidraw — nobody here is writing equations or diagrams in a note.
 *   font / colour    — a text colour picker in a process doc is a way to make
 *                      documents that disagree with each other.
 *
 * Order matters in one place only: MarkdownKit must be present for the
 * serialiser that keeps `resources.body` in sync for search.
 */
export const NoteEditorKit = [
  // Structure
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...TocKit,
  ...CalloutKit,
  ...ColumnKit,
  ...ListKit,
  ...IndentKit,
  ...LinkKit,

  // Marks
  ...BasicMarksKit,

  // References. The picker behind `@` is wired to real CRM records in
  // lib/useMentionables — and it's the same component Channels will need.
  ...MentionKit,

  // Editing surface
  ...SlashKit,
  ...BlockMenuKit,
  ...DndKit,

  // Serialisation for the markdown mirror.
  ...MarkdownKit,

  /*
   * Guarantees a trailing paragraph. Without it a note ending in a table or a
   * code block has nowhere to click to keep writing, and the only escape is
   * keyboard navigation most people don't know.
   */
  TrailingBlockPlugin,
];
