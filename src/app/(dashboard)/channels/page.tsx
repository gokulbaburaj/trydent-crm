"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash, MessageSquare, Plus, Trash2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { useAuth } from "@/lib/useAuth";
import { useChannel } from "@/lib/useChannel";
import { useMentionables } from "@/lib/useMentionables";
import { resolveMentions } from "@/lib/mentions";
import { MentionInput } from "@/components/channels/MentionInput";
import { MessageBody } from "@/components/channels/MessageBody";
import type { Channel, Message, Team } from "@/lib/types";

/**
 * Channels — team chat.
 *
 * Every channel is open to everyone who can reach chat. No private channels,
 * no DMs; membership is a bookmark, not a permission (see 2026-08-03b).
 *
 * The channel list uses `useSupabaseTable` because channels are few and
 * long-lived. Messages emphatically do not — see `useChannel`.
 */

/** Same calendar day? Used to decide when a date separator is worth drawing. */
function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ChannelsPage() {
  // useSearchParams needs a boundary or the route can't be prerendered.
  return (
    <Suspense fallback={<div className="p-6 text-[12px] text-muted-2">Loading channels...</div>}>
      <Channels />
    </Suspense>
  );
}

function Channels() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const teamParam = searchParams.get("team");

  const { rows: channels, setRows: setChannels, loading } = useSupabaseTable<Channel>(
    "channels",
    { column: "name", ascending: true }
  );
  const { rows: teams } = useSupabaseTable<Team>("teams", { column: "name", ascending: true });
  const { rows: staff } = useStaffProfiles();
  const mentionables = useMentionables();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState("");

  const live = useMemo(() => channels.filter((c) => !c.archived), [channels]);

  /** Team channels are listed apart — they're the ones with a home in the nav. */
  const teamName = useMemo(() => {
    const byId = new Map(teams.map((t) => [t.id, t.name]));
    return (c: Channel) => (c.team_id ? byId.get(c.team_id) ?? null : null);
  }, [teams]);

  const teamChannels = useMemo(() => live.filter((c) => c.team_id), [live]);
  const generalChannels = useMemo(() => live.filter((c) => !c.team_id), [live]);

  /*
   * `?team=Design` from the sidebar wins over whatever was last clicked, so the
   * link always lands where it says it will. The param is the team NAME, since
   * that's what every other team link in the sidebar already carries.
   */
  const fromParam = useMemo(() => {
    if (!teamParam) return null;
    const team = teams.find((t) => t.name === teamParam);
    if (!team) return null;
    return live.find((c) => c.team_id === team.id)?.id ?? null;
  }, [teamParam, teams, live]);

  /*
   * Land on a channel without an effect. Reading a fallback during render
   * avoids the extra paint (and the lint rule) that setting state in an effect
   * would cost.
   */
  const activeChannelId = fromParam ?? activeId ?? live[0]?.id ?? null;
  const active = live.find((c) => c.id === activeChannelId) ?? null;

  const { messages, loading: loadingMessages, hasMore, loadingOlder, loadOlder, send, remove, error } =
    useChannel(activeChannelId, profile?.id ?? null);

  const authorOf = (id: string | null) =>
    id ? staff.find((s) => s.id === id) ?? null : null;

  // Stick to the bottom on new messages, the way every chat client does.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeChannelId]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  async function createChannel() {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || !profile) return;
    const supabase = createClient();
    if (!supabase) return;

    const { data, error: err } = await supabase
      .from("channels")
      .insert({ name, created_by: profile.id })
      .select()
      .single();

    if (err) {
      toast.error(
        err.code === "23505" ? `#${name} already exists.` : "Couldn't create that channel."
      );
      return;
    }
    const created = data as Channel;
    setChannels((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveId(created.id);
    setNewName("");
    setCreating(false);
  }

  /** Send button and Enter take the same path, so they can't disagree. */
  function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft(""); // clear first so the input never lags the optimistic message
    void send(body, resolveMentions(body, mentionables));
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Channel list */}
      <aside className="hidden w-52 shrink-0 flex-col gap-1 sm:flex">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Channels
          </span>
          <button
            onClick={() => setCreating((c) => !c)}
            title="New channel"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createChannel();
            }}
            className="mb-1 px-1"
          >
            <Input
              autoFocus
              placeholder="channel-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => !newName && setCreating(false)}
            />
          </form>
        )}

        {generalChannels.map((c) => (
          <ChannelLink
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            onClick={() => setActiveId(c.id)}
          />
        ))}

        {teamChannels.length > 0 && (
          <p className="mb-0.5 mt-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Teams
          </p>
        )}
        {teamChannels.map((c) => (
          <ChannelLink
            key={c.id}
            channel={c}
            active={c.id === activeChannelId}
            hint={teamName(c)}
            onClick={() => setActiveId(c.id)}
          />
        ))}

        {!loading && live.length === 0 && (
          <p className="px-2 py-4 text-[12px] text-muted-2">
            No channels yet. Create one with the + above.
          </p>
        )}
      </aside>

      {/* Conversation */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-surface">
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={MessageSquare}
              title={loading ? "Loading channels..." : "No channel selected"}
              description={
                loading ? undefined : "Create a channel to start a conversation with the team."
              }
            />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2.5">
              <Hash className="h-4 w-4 text-muted-2" />
              <span className="text-[14px] font-semibold">{active.name}</span>
              {active.topic && (
                <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                  {active.topic}
                </span>
              )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {hasMore && messages.length > 0 && (
                <div className="mb-3 flex justify-center">
                  <Button size="sm" variant="secondary" onClick={() => void loadOlder()}>
                    {loadingOlder ? "Loading..." : "Load earlier messages"}
                  </Button>
                </div>
              )}

              {loadingMessages && (
                <p className="py-8 text-center text-[12px] text-muted-2">Loading messages...</p>
              )}

              {!loadingMessages && messages.length === 0 && (
                <p className="py-10 text-center text-[12px] text-muted-2">
                  Nothing here yet. Say something.
                </p>
              )}

              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || !sameDay(prev.created_at, m.created_at);
                /*
                 * Group consecutive messages from one person within five
                 * minutes: repeating the avatar and name on every line turns a
                 * conversation into a list of records.
                 */
                const grouped =
                  !newDay &&
                  prev?.author_id === m.author_id &&
                  new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() <
                    5 * 60 * 1000;

                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 flex items-center gap-3">
                        <div className="h-px flex-1 bg-border-subtle" />
                        <span className="text-[11px] text-muted-2">{dayLabel(m.created_at)}</span>
                        <div className="h-px flex-1 bg-border-subtle" />
                      </div>
                    )}
                    <MessageRow
                      message={m}
                      grouped={grouped}
                      authorName={authorOf(m.author_id)?.full_name ?? "Unknown"}
                      authorAvatar={authorOf(m.author_id)?.avatar_url ?? null}
                      mine={m.author_id === profile?.id}
                      meId={profile?.id ?? null}
                      onDelete={() => void remove(m.id)}
                    />
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="flex shrink-0 items-end gap-2 border-t border-border-subtle p-2.5">
              <MentionInput
                value={draft}
                onChange={setDraft}
                placeholder={`Message #${active.name} — @ for people, # for projects`}
                onSubmit={(body, mentions) => {
                  setDraft("");
                  void send(body, mentions);
                }}
              />
              <Button size="sm" disabled={!draft.trim()} onClick={submit}>
                Send
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ChannelLink({
  channel,
  active,
  hint,
  onClick,
}: {
  channel: Channel;
  active: boolean;
  hint?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint ? `${hint} team` : channel.topic ?? channel.name}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        active
          ? "bg-white/10 font-medium text-foreground"
          : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
      )}
    >
      {channel.team_id ? (
        <Users className="h-3.5 w-3.5 shrink-0 text-muted-2" />
      ) : (
        <Hash className="h-3.5 w-3.5 shrink-0 text-muted-2" />
      )}
      <span className="min-w-0 truncate">{channel.name}</span>
    </button>
  );
}

function MessageRow({
  message,
  grouped,
  authorName,
  authorAvatar,
  mine,
  meId,
  onDelete,
}: {
  message: Message;
  grouped: boolean;
  authorName: string;
  authorAvatar: string | null;
  mine: boolean;
  meId: string | null;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex gap-2.5 rounded px-1 py-0.5 hover:bg-white/[0.02]",
        grouped ? "mt-0.5" : "mt-2.5"
      )}
    >
      <div className="w-6 shrink-0">
        {!grouped && <Avatar name={authorName} url={authorAvatar} size="xs" />}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{authorName}</span>
            <span className="text-[11px] text-muted-2">{timeLabel(message.created_at)}</span>
          </p>
        )}
        <p className="text-[13px] text-foreground-secondary">
          <MessageBody body={message.body} mentions={message.mentions} meId={meId} />
          {message.edited_at && <span className="ml-1 text-[11px] text-muted-2">(edited)</span>}
        </p>
      </div>
      {mine && (
        <button
          onClick={onDelete}
          aria-label="Delete message"
          className="shrink-0 self-start rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-white/5 hover:text-danger group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
