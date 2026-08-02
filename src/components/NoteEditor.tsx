"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Value } from "platejs";
import { deserializeMd, serializeMd } from "@platejs/markdown";
import { Plate, usePlateEditor } from "platejs/react";
import { Editor, EditorContainer } from "@/components/editor/ui/editor";
import { NoteEditorKit } from "@/components/editor/plugins/note-editor-kit";
import { cn } from "@/lib/utils";

/**
 * Notion-style block editor for resource notes, on Plate.
 *
 * Loaded through `next/dynamic` with `ssr: false` — see the detail page.
 * Slate builds its DOM on mount and the drag layer touches `window`, so
 * server-rendering it is a fight with no prize.
 *
 * Storage contract, restated because it's easy to get backwards:
 *
 *   content (jsonb)  — Slate value. Source of truth. What this reads and writes.
 *   body    (text)   — a markdown MIRROR regenerated on every save, so the
 *                      Postgres full-text index has prose to chew on rather
 *                      than jsonb structure keys.
 *
 * Nothing ever loads a note back from `body` in normal operation. The one
 * exception is the migration path below, which is exactly why keeping the
 * mirror honest was worth the trouble.
 */

const SAVE_DEBOUNCE_MS = 800;

export interface NoteEditorProps {
  /** Stored document. May be a Slate value, or BlockNote's old block tree. */
  content: unknown[] | null;
  /** Markdown mirror. The fallback when `content` isn't usable Slate. */
  markdown: string | null;
  editable: boolean;
  /** Called with both representations. Debounced; also flushed on unmount. */
  onSave: (next: { content: unknown[]; body: string }) => void;
  className?: string;
}

/**
 * Is this a Slate value, or the block tree BlockNote used to write?
 *
 * They're both arrays of objects with a `type` and `children`, so a shallow
 * check isn't enough. BlockNote blocks always carry a `props` object; Slate
 * nodes never do. When it isn't Slate we ignore `content` entirely and rebuild
 * from the markdown mirror — lossy for callouts, but correct, and it means the
 * editor swap needs no backfill and no downtime.
 */
function isSlateValue(content: unknown[] | null): content is Value {
  if (!Array.isArray(content) || content.length === 0) return false;
  const first = content[0] as Record<string, unknown> | null;
  if (!first || typeof first !== "object") return false;
  if ("props" in first) return false; // BlockNote
  return "children" in first || "type" in first;
}

const EMPTY: Value = [{ type: "p", children: [{ text: "" }] }];

export default function NoteEditor({
  content,
  markdown,
  editable,
  onSave,
  className,
}: NoteEditorProps) {
  /*
   * The initial value is computed once, inside the editor factory.
   *
   * Plate reads `value` when the editor is constructed and ignores it after —
   * correctly, since re-seeding a live editor from props would stomp whatever
   * had just been typed. The detail page keys this component on the resource
   * id so switching notes remounts rather than mutates.
   */
  const editor = usePlateEditor({
    plugins: NoteEditorKit,
    value: (ed) => {
      if (isSlateValue(content)) return content;
      const md = markdown?.trim();
      if (md) {
        const parsed = deserializeMd(ed, md);
        if (parsed.length > 0) return parsed;
      }
      return EMPTY;
    },
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

  const handleChange = useCallback(
    ({ value }: { value: Value }) => {
      if (!editable) return;
      // Serialise here rather than at save time: it's cheap, and it stops the
      // two representations drifting apart by a keystroke.
      pending.current = { content: value, body: serializeMd(editor) };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [editable, editor, flush]
  );

  /*
   * A note written up to the moment you close the tab should still be there.
   * `beforeunload` covers the tab; the cleanup covers client-side navigation,
   * which is the common case in a single-page app and the one people actually
   * lose work to.
   */
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      flush();
    };
  }, [flush]);

  return (
    <div className={cn("note-editor", !editable && "note-editor--readonly", className)}>
      <Plate editor={editor} onChange={handleChange} readOnly={!editable}>
        {/*
          `h-auto overflow-visible` overrides two of EditorContainer's defaults,
          and both matter.

          Its base classes include `overflow-y-auto`, and CSS computes the other
          axis to `auto` whenever one axis isn't `visible` — so the container
          clips horizontally. Plate renders the drag handle and + button with
          `-translate-x-full`, i.e. outside the block, so they get clipped away
          silently. That is what "all the block commands are gone" was: a
          layout bug with no error.

          `h-full` is the other one: it would make the editor its own scroll
          region inside the page. A document should scroll with the page.
        */}
        <EditorContainer className="h-auto overflow-visible">
          <Editor
            variant="none"
            placeholder={editable ? "Write, or press '/' for commands…" : ""}
          />
        </EditorContainer>
      </Plate>
    </div>
  );
}
