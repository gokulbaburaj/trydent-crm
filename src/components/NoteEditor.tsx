"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/core/style.css";
import "@blocknote/shadcn/style.css";
import { cn } from "@/lib/utils";

/**
 * Notion-style block editor for resource notes.
 *
 * Loaded through `next/dynamic` with `ssr: false` — see the detail page.
 * ProseMirror touches `document` while constructing its view, so rendering
 * this on the server is a fight with no prize.
 *
 * Storage contract, restated because it's easy to get backwards:
 *
 *   content (jsonb)  — what this component reads and writes. Source of truth.
 *   body    (text)   — a markdown mirror this component regenerates on save,
 *                      purely so the full-text index has prose to chew on.
 *
 * Nothing ever loads a note back from `body`. The markdown conversion is lossy
 * — a callout flattens to a blockquote — and that's acceptable precisely
 * because the mirror is only ever searched, never read.
 */

const SAVE_DEBOUNCE_MS = 800;

export interface NoteEditorProps {
  /** Stored block tree. Null for a note written before the block editor. */
  content: unknown[] | null;
  /** Existing markdown, parsed into blocks when `content` is null. */
  markdown: string | null;
  editable: boolean;
  /** Called with both representations. Debounced; also flushed on unmount. */
  onSave: (next: { content: unknown[]; body: string }) => void;
  className?: string;
}

export default function NoteEditor({
  content,
  markdown,
  editable,
  onSave,
  className,
}: NoteEditorProps) {
  const { resolvedTheme } = useTheme();

  /*
   * Initial blocks are computed once, at construction.
   *
   * `initialContent` is not reactive — BlockNote reads it when the editor is
   * built and ignores it afterwards, which is correct: re-seeding a live
   * editor from props would stomp whatever the person had just typed. The
   * detail page keys this component on the resource id so switching notes
   * remounts rather than mutates.
   *
   * An empty array is not a valid initial document, so a genuinely empty note
   * gets one empty paragraph. Passing `[]` throws inside ProseMirror with a
   * message that doesn't mention BlockNote at all.
   */
  const initial = (content ?? undefined) as PartialBlock[] | undefined;
  const editor = useCreateBlockNote({
    initialContent: initial && initial.length > 0 ? initial : undefined,
  });

  /*
   * The latest onSave, held in a ref so the debounce timer and the unmount
   * flush always call the current one without re-creating themselves on every
   * parent render. Written in an effect, not during render — a ref assignment
   * in a render body is skipped when React discards a render attempt, so the
   * ref can end up holding a callback that was never committed.
   */
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ content: unknown[]; body: string } | null>(null);
  const migrated = useRef(false);

  /*
   * One-time migration: a note stored before the block editor arrives with
   * `content: null` and markdown in `body`. Parse it, put it in the editor,
   * and save so it never converts again.
   *
   * Done here rather than as a bulk SQL backfill because the parser lives in
   * the browser — and because a note nobody opens costs nothing to leave
   * alone. No downtime, no migration window, no risk of mangling every note at
   * once with a conversion bug.
   */
  useEffect(() => {
    if (migrated.current) return;
    migrated.current = true;
    if (content !== null || !markdown?.trim()) return;

    let cancelled = false;
    (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(markdown);
      if (cancelled || blocks.length === 0) return;
      editor.replaceBlocks(editor.document, blocks);
      onSaveRef.current({
        content: editor.document,
        body: await editor.blocksToMarkdownLossy(editor.document),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, content, markdown]);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current) {
      onSaveRef.current(pending.current);
      pending.current = null;
    }
  }, []);

  const handleChange = useCallback(async () => {
    if (!editable) return;
    const blocks = editor.document as Block[];
    // Generate the mirror here rather than at save time: it's cheap, and it
    // keeps the two representations from ever drifting by a keystroke.
    const body = await editor.blocksToMarkdownLossy(blocks);
    pending.current = { content: blocks, body };

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [editor, editable, flush]);

  /* Never lose the last few hundred milliseconds of typing to a navigation. */
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      flush();
    };
  }, [flush]);

  return (
    <div
      className={cn(
        // BlockNote ships its own CSS variables. Map them onto the app's tokens
        // so the editor inherits the theme instead of announcing itself, and
        // strip the default page padding — the Card already provides it.
        "note-editor",
        !editable && "note-editor--readonly",
        className
      )}
    >
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === "light" ? "light" : "dark"}
        onChange={handleChange}
      />
    </div>
  );
}
