"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A small markdown renderer.
 *
 * Why not a library: the app has no markdown dependency and this needs
 * headings, emphasis, code, links, lists, quotes and rules — a few hundred
 * lines against a few hundred kilobytes. If notes ever grow tables, footnotes
 * or embedded HTML, swap this for `react-markdown` and delete the file; the
 * stored format doesn't change either way.
 *
 * It returns React nodes rather than an HTML string, so there is no
 * `dangerouslySetInnerHTML` anywhere and no escaping to get wrong. A `<script>`
 * typed into a note renders as the literal text `<script>`, because React
 * treats it as text. That matters less here than elsewhere (only admins write
 * these) but "less" is not "not at all", and the safe version was no harder.
 *
 * Supported: # headings, **bold**, *italic*, `code`, [links](url), - and 1.
 * lists, > quotes, ``` fences, --- rules.
 */

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-[13.5px] leading-relaxed", className)}>
      {renderBlocks(children)}
    </div>
  );
}

/* ── Block level ────────────────────────────────────────────────────────── */

function renderBlocks(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Everything inside is literal — no inline parsing, which is
    // the entire point of a fence.
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++; // closing fence, or end of input if it was never closed
      out.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-md border border-border-subtle bg-white/[0.03] p-3 text-[12.5px] leading-relaxed"
        >
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^ {0,3}(---|\*\*\*|___)\s*$/.test(line)) {
      out.push(<hr key={key++} className="border-border-subtle" />);
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2]);
      const sizes = ["text-lg", "text-[15px]", "text-[13.5px]", "text-[13px]"];
      out.push(
        <p key={key++} className={cn("font-semibold text-foreground", sizes[level - 1])}>
          {text}
        </p>
      );
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote
          key={key++}
          className="border-l-2 border-border pl-3 text-muted-foreground"
        >
          {body.join(" ").trim() && inline(body.join(" "))}
        </blockquote>
      );
      continue;
    }

    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;

    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(lines[i].replace(re, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List
          key={key++}
          className={cn(
            "flex flex-col gap-1 pl-5",
            ordered ? "list-decimal" : "list-disc",
            "marker:text-muted-2"
          )}
        >
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </List>
      );
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !/^ {0,3}(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(
      <p key={key++} className="text-foreground-secondary">
        {inline(para.join(" "))}
      </p>
    );
  }

  return out;
}

/* ── Inline level ───────────────────────────────────────────────────────── */

/**
 * One pass, one regex, alternation ordered so the greedier syntax wins:
 * code before emphasis (so `**` inside backticks stays literal), links before
 * bare URLs, `**` before `*`.
 */
const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<)]+)/g;

function inline(src: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(src)) !== null) {
    if (m.index > last) out.push(<Fragment key={key++}>{src.slice(last, m.index)}</Fragment>);
    const token = m[0];

    if (token.startsWith("`")) {
      out.push(
        <code
          key={key++}
          className="rounded border border-border-subtle bg-white/[0.05] px-1 py-0.5 text-[12px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      out.push(
        link ? (
          <ExternalAnchor key={key++} href={link[2]}>
            {link[1]}
          </ExternalAnchor>
        ) : (
          <Fragment key={key++}>{token}</Fragment>
        )
      );
    } else {
      out.push(
        <ExternalAnchor key={key++} href={token}>
          {token}
        </ExternalAnchor>
      );
    }

    last = m.index + token.length;
  }

  if (last < src.length) out.push(<Fragment key={key++}>{src.slice(last)}</Fragment>);
  return out;
}

/**
 * `noopener` matters: without it the opened page gets a handle on this one via
 * `window.opener` and can navigate it somewhere else.
 */
function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  const safe = /^(https?:|mailto:|\/)/i.test(href) ? href : `https://${href}`;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  );
}
