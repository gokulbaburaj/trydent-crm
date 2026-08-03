import type { Mention, MentionType } from "@/lib/types";
import type { Mentionable, MentionKind } from "@/lib/useMentionables";

/**
 * How a reference survives inside a message.
 *
 * The body is plain text carrying opaque markers:
 *
 *   "blocked on @[profile:8f2…] finishing #[project:1a4…]"
 *
 * and the labels live in `messages.mentions` alongside. Two consequences worth
 * being deliberate about:
 *
 * - The marker has no label in it, so renaming a project can't leave a message
 *   asserting the old name as if it were current.
 * - The label IS snapshotted in the mentions array, so a message still reads
 *   sensibly after the project is renamed or the person leaves. The chip links
 *   to whatever exists now; the sentence records what was said then.
 *
 * Storing the label only in the body would make messages lie after a rename.
 * Storing it only by join would make deleted records blank out mid-sentence.
 * Both, on purpose.
 */

/** `@` picks people, `#` picks everything else. */
export const PERSON_TRIGGER = "@";
export const OBJECT_TRIGGER = "#";

/** `useMentionables` says "person"; the stored type says "profile". */
export function toMentionType(kind: MentionKind): MentionType {
  return kind === "person" ? "profile" : kind;
}

function triggerFor(type: MentionType): string {
  return type === "profile" ? PERSON_TRIGGER : OBJECT_TRIGGER;
}

/** The marker that goes in the STORED body for a chosen item. */
export function markerFor(item: Mentionable): string {
  const [, id] = item.key.split(":");
  return `${triggerFor(toMentionType(item.kind))}[${toMentionType(item.kind)}:${id}]`;
}

/** What the person sees while typing: `#Social Media`, never the uuid. */
export function displayFor(item: Mentionable): string {
  return `${triggerFor(toMentionType(item.kind))}${item.text}`;
}

/**
 * Turn readable draft text into stored markers at send time.
 *
 * The composer holds `#Social Media`; the database holds
 * `#[project:f60e…]`. Doing the swap here means the input never shows a uuid,
 * which is the whole point — a chat box that displays raw identifiers looks
 * broken no matter how correct it is underneath.
 *
 * `picked` maps the exact inserted text to its reference. Longest labels are
 * replaced first so "#Branding Rice" can't be eaten by "#Branding". Anything
 * the person edited by hand simply stops matching and stays plain text, which
 * is the honest outcome: half a label is not a reference.
 */
export function toStored(
  draft: string,
  picked: Map<string, Mention>
): { body: string; mentions: Mention[] } {
  const keys = [...picked.keys()].sort((a, b) => b.length - a.length);
  let body = draft;
  const used: Mention[] = [];

  for (const key of keys) {
    const mention = picked.get(key)!;
    if (!body.includes(key)) continue;
    const marker = `${mention.type === "profile" ? PERSON_TRIGGER : OBJECT_TRIGGER}[${mention.type}:${mention.id}]`;
    body = body.split(key).join(marker);
    if (!used.some((m) => m.id === mention.id && m.type === mention.type)) {
      used.push(mention);
    }
  }
  return { body, mentions: used };
}

export function mentionFor(item: Mentionable): Mention {
  const [, id] = item.key.split(":");
  return { type: toMentionType(item.kind), id, label: item.text };
}

/**
 * Matches a marker. Deliberately strict about the id shape — a loose pattern
 * would swallow ordinary text like "#[1]" and turn a sentence into a chip.
 */
const MARKER =
  /[@#]\[(profile|project|client|deal|task):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]/g;

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mention"; type: MentionType; id: string; label: string };

/**
 * Split a body into text and mention segments.
 *
 * An unresolvable marker — one with no entry in `mentions` — renders as a chip
 * labelled "unknown" rather than raw marker syntax. It means something was
 * deleted, and showing `@[profile:8f2…]` to a person is worse than admitting it.
 */
export function parseBody(body: string, mentions: Mention[] = []): Segment[] {
  const byId = new Map(mentions.map((m) => [`${m.type}:${m.id}`, m.label]));
  const out: Segment[] = [];
  let last = 0;

  // The regex is module-level and stateful; reset before each use or the
  // second call on the same string starts from wherever the first stopped.
  MARKER.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MARKER.exec(body)) !== null) {
    if (match.index > last) {
      out.push({ kind: "text", text: body.slice(last, match.index) });
    }
    const type = match[1] as MentionType;
    const id = match[2];
    out.push({
      kind: "mention",
      type,
      id,
      label: byId.get(`${type}:${id}`) ?? "unknown",
    });
    last = match.index + match[0].length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}

/**
 * Read the markers out of a body and snapshot their labels from live data.
 *
 * Doing it here rather than tracking picks in component state means the
 * composer holds no hidden bookkeeping: whatever markers survive editing are
 * exactly the references that get stored, and pressing Enter and clicking Send
 * cannot diverge. Deleting a marker un-mentions the person, which is what
 * deleting it looks like.
 */
export function resolveMentions(body: string, items: Mentionable[]): Mention[] {
  const byKey = new Map(
    items.map((i) => {
      const [kind, id] = i.key.split(":");
      return [`${toMentionType(kind as MentionKind)}:${id}`, i.text];
    })
  );

  const out: Mention[] = [];
  const seen = new Set<string>();
  MARKER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER.exec(body)) !== null) {
    const type = match[1] as MentionType;
    const id = match[2];
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A marker for something since deleted keeps its slot with a plain label,
    // so the sentence still reads rather than collapsing to raw syntax.
    out.push({ type, id, label: byKey.get(key) ?? "unknown" });
  }
  return out;
}

/** Where a chip navigates to. Null when the type has no page of its own. */
export function hrefForMention(type: MentionType, id: string): string | null {
  switch (type) {
    case "profile":
      return "/team";
    case "project":
      return `/projects/${id}`;
    case "client":
      return `/clients/${id}`;
    case "deal":
      return "/pipeline";
    default:
      return null;
  }
}

/** Plain-text version, for notifications and anywhere a chip can't render. */
export function plainText(body: string, mentions: Mention[] = []): string {
  return parseBody(body, mentions)
    .map((s) =>
      s.kind === "text" ? s.text : `${s.type === "profile" ? "@" : "#"}${s.label}`
    )
    .join("");
}

/**
 * An active trigger in the composer, if the caret sits in one.
 *
 * Scans back from the caret for `@` or `#`, giving up at whitespace — so a
 * stray `@` earlier in the sentence can't reopen the picker while you type a
 * paragraph later. Returns the query typed so far and the range to replace.
 */
export function activeTrigger(
  value: string,
  caret: number
): { trigger: string; query: string; from: number } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === PERSON_TRIGGER || ch === OBJECT_TRIGGER) {
      /*
       * Must start a word: the "@" in an email address is not a mention.
       *
       * Written as an explicit position check because the obvious version,
       * `/\s|^/.test(before)`, is always true — `^` matches position zero of
       * whatever string you hand it, so the alternation never fails. Typing
       * "a@b.com" opened the people picker until a test caught it.
       */
      if (i > 0 && !/\s/.test(value[i - 1])) return null;
      return { trigger: ch, query: value.slice(i + 1, caret), from: i };
    }
    if (/\s/.test(ch)) return null;
    // A long run without a trigger isn't a mention being typed.
    if (caret - i > 40) return null;
  }
  return null;
}

/** Which mentionables a trigger offers. */
export function candidatesFor(
  items: Mentionable[],
  trigger: string,
  query: string
): Mentionable[] {
  const q = query.trim().toLowerCase();
  return items
    .filter((i) =>
      trigger === PERSON_TRIGGER ? i.kind === "person" : i.kind !== "person"
    )
    .filter((i) => !q || i.text.toLowerCase().includes(q))
    .slice(0, 8);
}
