"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { AtSign, Building2, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  activeTrigger,
  candidatesFor,
  displayFor,
  mentionFor,
  toStored,
  PERSON_TRIGGER,
} from "@/lib/mentions";
import { useMentionables } from "@/lib/useMentionables";
import type { Mention } from "@/lib/types";

/**
 * Composer with `@` and `#` reference picking.
 *
 * A textarea, not a rich editor. The last attempt at a block editor in this
 * codebase cost a week and got deleted; a chat composer needs to accept a line
 * of text and get out of the way.
 *
 * What you see while typing is the label — `#Social Media`. The uuid only
 * exists in the stored body, substituted on submit. The first version put the
 * raw marker in the input on the theory that it was unambiguous; it was, and it
 * also looked like the app was broken. Legibility wins.
 */

export interface MentionInputHandle {
  submit: () => void;
}

export const MentionInput = forwardRef<
  MentionInputHandle,
  {
    value: string;
    onChange: (value: string) => void;
    /** Called with the stored body and its references. */
    onSubmit: (body: string, mentions: Mention[]) => void;
    placeholder?: string;
    disabled?: boolean;
  }
>(function MentionInput({ value, onChange, onSubmit, placeholder, disabled }, handleRef) {
  const items = useMentionables();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  /**
   * Readable text -> reference, for everything picked this message.
   *
   * A ref, not state: it's only ever read at submit time, and re-rendering the
   * composer on every pick would fight the caret restore below.
   */
  const picked = useRef<Map<string, Mention>>(new Map());

  const trigger = activeTrigger(value, caret);
  const options = trigger ? candidatesFor(items, trigger.trigger, trigger.query) : [];
  const open = !!trigger && options.length > 0;

  function choose(index: number) {
    if (!trigger) return;
    const item = options[index];
    if (!item) return;

    // The visible text is the label. The uuid never reaches the input — it's
    // substituted at submit, so what you type is what you read back.
    const shown = displayFor(item);
    picked.current.set(shown, mentionFor(item));

    const next = value.slice(0, trigger.from) + shown + " " + value.slice(caret);
    onChange(next);
    setHighlight(0);

    // Put the caret after the inserted label rather than leaving it wherever
    // React lands it, or the next keystroke reopens the picker.
    const pos = trigger.from + shown.length + 1;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  function submit() {
    const draft = value.trim();
    if (!draft) return;
    // Swap readable labels for stored markers here, at the last possible
    // moment. Anything edited by hand no longer matches and stays plain text.
    const { body, mentions } = toStored(draft, picked.current);
    onSubmit(body, mentions);
    picked.current = new Map();
    setHighlight(0);
  }

  // The Send button drives the same function, so button and Enter can't drift.
  useImperativeHandle(handleRef, () => ({ submit }));

  return (
    <div className="relative flex-1">
      {open && (
        <div className="absolute bottom-full z-30 mb-1 w-64 overflow-hidden rounded-md border border-border bg-panel shadow-lg">
          <p className="border-b border-border-subtle px-2 py-1 text-[11px] text-muted-2">
            {trigger!.trigger === PERSON_TRIGGER ? "People" : "Projects and clients"}
          </p>
          {options.map((o, i) => {
            const Icon =
              o.kind === "person" ? AtSign : o.kind === "client" ? Building2 : Hash;
            return (
              <button
                key={o.key}
                type="button"
                // onMouseDown, not onClick: click fires after blur, and the
                // blur would already have closed the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[13px] transition-colors",
                  i === highlight
                    ? "bg-active text-foreground"
                    : "text-foreground-secondary hover:bg-hover"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-2" />
                <span className="min-w-0 truncate">{o.text}</span>
              </button>
            );
          })}
        </div>
      )}

      <textarea
        ref={ref}
        rows={1}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setCaret(e.target.selectionStart ?? 0);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              choose(highlight);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              // Nudging the caret closes the picker without touching the text.
              setCaret((c) => c);
              ref.current?.setSelectionRange(caret, caret);
              return;
            }
          }
          // Enter sends; Shift+Enter is a newline. The opposite convention
          // makes every message a two-step action.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-32 min-h-9 w-full resize-none rounded-md border border-edge bg-transparent px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-2 focus:border-primary/60 focus:outline-none focus:ring-[3px] focus:ring-primary/20"
      />
    </div>
  );
});
