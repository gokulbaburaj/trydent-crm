"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Markdown rendering for resource notes.
 *
 * This replaced a hand-rolled parser once `react-markdown` was available. The
 * stored format didn't change — it was always plain markdown — so existing
 * notes render unchanged; what's new is tables, task lists, strikethrough and
 * autolinks, all from `remark-gfm`. Tables are the reason it was worth the
 * dependency: a rate card or a who-approves-what grid wants one.
 *
 * Two properties worth keeping:
 *
 * 1. No `dangerouslySetInnerHTML`. `react-markdown` builds React elements, and
 *    raw HTML in the source is escaped unless you opt in with `rehype-raw` —
 *    which we deliberately don't. A `<script>` typed into a note renders as the
 *    literal text. Only admins write these, but "only admins" is a policy and
 *    escaping is a property, and properties are the ones that hold.
 *
 * 2. Explicit element mapping instead of a typography plugin. Every element
 *    below uses the app's own tokens, so a note looks like the rest of the CRM
 *    rather than like a blog post embedded in it.
 */

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-[13.5px] leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* ── Element map ────────────────────────────────────────────────────────── */

type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

const COMPONENTS = {
  h1: (p: Props<"h1">) => <p className="text-lg font-semibold text-foreground" {...p} />,
  h2: (p: Props<"h2">) => <p className="text-[15px] font-semibold text-foreground" {...p} />,
  h3: (p: Props<"h3">) => <p className="text-[13.5px] font-semibold text-foreground" {...p} />,
  h4: (p: Props<"h4">) => <p className="text-[13px] font-semibold text-foreground" {...p} />,

  p: (p: Props<"p">) => <p className="text-foreground-secondary" {...p} />,

  strong: (p: Props<"strong">) => (
    <strong className="font-semibold text-foreground" {...p} />
  ),
  em: (p: Props<"em">) => <em {...p} />,
  del: (p: Props<"del">) => <del className="text-muted-2" {...p} />,

  a: ({ href, children, ...rest }: Props<"a">) => (
    <a
      // Relative and hash links stay as-is; anything else that forgot its
      // scheme gets https, because href="trydent.xyz" resolves against the
      // current origin and 404s.
      href={safeHref(href)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
      {...rest}
    >
      {children}
    </a>
  ),

  ul: (p: Props<"ul">) => (
    <ul className="flex flex-col gap-1 pl-5 marker:text-muted-2 [&_ul]:mt-1 list-disc" {...p} />
  ),
  ol: (p: Props<"ol">) => (
    <ol className="flex flex-col gap-1 pl-5 marker:text-muted-2 [&_ol]:mt-1 list-decimal" {...p} />
  ),
  li: (p: Props<"li">) => <li className="text-foreground-secondary" {...p} />,

  // GFM task lists. Read-only: these live inside a note, and a checkbox that
  // silently doesn't save is worse than one that's visibly inert. Real
  // trackable work belongs on a project as a task.
  input: ({ type, checked, ...rest }: Props<"input">) =>
    type === "checkbox" ? (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mr-1.5 h-3 w-3 translate-y-[1px] accent-primary"
        {...rest}
      />
    ) : null,

  blockquote: (p: Props<"blockquote">) => (
    <blockquote
      className="border-l-2 border-border pl-3 text-muted-foreground [&>p]:text-muted-foreground"
      {...p}
    />
  ),

  hr: () => <hr className="border-border-subtle" />,

  code: ({ className, children, ...rest }: Props<"code">) => {
    // react-markdown gives fenced code a `language-*` class and inline code
    // none — that's the only reliable way to tell them apart here.
    const fenced = /language-/.test(className ?? "");
    if (fenced) {
      return (
        <code className={cn("block", className)} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded border border-border-subtle bg-white/[0.05] px-1 py-0.5 text-[12px]"
        {...rest}
      >
        {children}
      </code>
    );
  },

  pre: (p: Props<"pre">) => (
    <pre
      className="overflow-x-auto rounded-md border border-border-subtle bg-white/[0.03] p-3 text-[12.5px] leading-relaxed"
      {...p}
    />
  ),

  // Tables — the reason the dependency earns its place. Styled to match
  // DataTable so a note's table doesn't look like a foreign object.
  table: (p: Props<"table">) => (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-[13px]" {...p} />
    </div>
  ),
  thead: (p: Props<"thead">) => <thead {...p} />,
  tr: (p: Props<"tr">) => (
    <tr className="border-b border-border-subtle last:border-0" {...p} />
  ),
  th: (p: Props<"th">) => (
    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground" {...p} />
  ),
  td: (p: Props<"td">) => <td className="px-3 py-2 align-top" {...p} />,

  img: ({ alt, ...rest }: Props<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} className="max-w-full rounded-md border border-border" {...rest} />
  ),
} satisfies Record<string, (props: never) => ReactNode>;

function safeHref(href: string | undefined): string {
  if (!href) return "#";
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
  return `https://${href}`;
}
