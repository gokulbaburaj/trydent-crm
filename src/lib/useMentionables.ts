"use client";

import { useMemo } from "react";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import type { Client, Project, Resource } from "@/lib/types";

/**
 * What `@` can reference inside a note.
 *
 * The mention component Plate ships with has a hardcoded list of Star Wars
 * characters. Useful for a demo, useless here — so this replaces it with the
 * things that actually exist in the CRM.
 *
 * Deliberately four kinds and no more: people, projects, clients, notes. Those
 * are the nouns someone writing an SOP reaches for. Deals and tasks are
 * omitted because a mention is a *stable* reference, and a deal that closes or
 * a task that's archived leaves a link pointing at something gone.
 *
 * This is also the picker Channels will need for `#` references. Building it
 * against notes first, where getting it wrong costs nothing, is most of the
 * reason Resources came before Channels.
 */

export type MentionKind = "person" | "project" | "client" | "note";

export interface Mentionable {
  /** `<kind>:<uuid>` — carries the type so a renderer can link correctly. */
  key: string;
  text: string;
  kind: MentionKind;
}

const PREFIX: Record<MentionKind, string> = {
  person: "",
  project: "",
  client: "",
  note: "",
};

export function useMentionables(): Mentionable[] {
  const { rows: staff } = useStaffProfiles();
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: resources } = useSupabaseTable<Resource>("resources");

  return useMemo(() => {
    const out: Mentionable[] = [];

    for (const p of staff) {
      out.push({ key: `person:${p.id}`, text: p.full_name, kind: "person" });
    }
    // Archived projects are excluded: mentioning one is almost always a
    // mistake, and it clutters the list you scan while typing.
    for (const p of projects) {
      if (!p.archived) out.push({ key: `project:${p.id}`, text: p.name, kind: "project" });
    }
    for (const c of clients) {
      out.push({ key: `client:${c.id}`, text: c.company, kind: "client" });
    }
    for (const r of resources) {
      out.push({ key: `note:${r.id}`, text: r.title, kind: "note" });
    }

    // People first — they're the most-typed and should be reachable without
    // scrolling. Everything else alphabetical within its kind.
    const order: Record<MentionKind, number> = { person: 0, project: 1, client: 2, note: 3 };
    return out.sort(
      (a, b) => order[a.kind] - order[b.kind] || a.text.localeCompare(b.text)
    );
  }, [staff, projects, clients, resources]);
}

/** Where a mention links to. Kind is encoded in the key, so this is a lookup. */
export function mentionHref(key: string): string | null {
  const [kind, id] = key.split(":");
  if (!id) return null;
  switch (kind) {
    case "person":
      return `/team`;
    case "project":
      return `/projects/${id}`;
    case "client":
      return `/clients`;
    case "note":
      return `/resources/${id}`;
    default:
      return null;
  }
}

export { PREFIX };
