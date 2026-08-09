"use client";

import Link from "next/link";
import { AtSign, Building2, GitBranch, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { hrefForMention, parseBody } from "@/lib/mentions";
import type { Mention, MentionType } from "@/lib/types";

/**
 * A message body with its references rendered as live chips.
 *
 * This is the whole reason Channels exists rather than a Slack workspace: a
 * message saying "the deck is late" is worth nothing in six months, and one
 * that links #social-media to the actual project is a record of why a decision
 * was made, attached to the thing it was about.
 */

const ICONS: Record<MentionType, React.ComponentType<{ className?: string }>> = {
  profile: AtSign,
  project: Hash,
  client: Building2,
  deal: GitBranch,
  task: Hash,
};

export function MessageBody({
  body,
  mentions,
  /** Highlight chips pointing at the reader — being named should be visible. */
  meId,
}: {
  body: string;
  mentions: Mention[];
  meId?: string | null;
}) {
  const segments = parseBody(body, mentions);

  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((s, i) => {
        if (s.kind === "text") return <span key={i}>{s.text}</span>;

        const Icon = ICONS[s.type] ?? Hash;
        const href = hrefForMention(s.type, s.id);
        const isMe = s.type === "profile" && !!meId && s.id === meId;

        const chip = (
          <span
            className={cn(
              "mx-px inline-flex items-baseline gap-0.5 rounded-md px-1 py-px align-baseline text-[12.5px] font-medium transition-colors",
              isMe
                ? "bg-warning/20 text-[var(--warning-fg)]"
                : "bg-primary/15 text-primary hover:bg-primary/25"
            )}
          >
            <Icon className="h-3 w-3 shrink-0 self-center" />
            {s.label}
          </span>
        );

        // An unresolvable reference points at nothing, so it shouldn't look
        // clickable — a chip that navigates to a 404 is worse than a flat one.
        return href && s.label !== "unknown" ? (
          <Link key={i} href={href} onClick={(e) => e.stopPropagation()}>
            {chip}
          </Link>
        ) : (
          <span key={i} title="This reference no longer exists">
            {chip}
          </span>
        );
      })}
    </span>
  );
}
