"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, MessageSquare, Plus, Trash2 } from "lucide-react";
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
import type { Channel, Message } from "@/lib/types";

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
  const { profile } = useAuth();
  const { rows: channels, setRows: setChannels, loading } = useSupabaseTable<Channel>(
    "channels",
    { column: "name", ascending: true }
  );
  const { rows: staff } = useStaffProfiles();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState("");

  const live = useMemo(() => channels.filter((c) => !c.archived), [channels]);

  /*
   * Land on the first channel without an effect. Reading a fallback during
   * render avoids the extra paint (and the lint rule) that setting state in an
   * effect would cost — and `activeId` still wins the moment one is picked.
   */
  const activeChannelId = activeId ?? live[0]?.id ?? null;
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft(""); // clear first so the input never lags the optimistic message
    void send(text);
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

        {live.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
              c.id === activeChannelId
                ? "bg-white/10 font-medium text-foreground"
                : "text-foreground-secondary hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Hash className="h-3.5 w-3.5 shrink-0 text-muted-2" />
            <span className="min-w-0 truncate">{c.name}</span>
          </button>
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
                      onDelete={() => void remove(m.id)}
                    />
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form
              onSubmit={submit}
              className="flex shrink-0 items-center gap-2 border-t border-border-subtle p-2.5"
            >
              <Input
                placeholder={`Message #${active.name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Send
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  authorName,
  authorAvatar,
  mine,
  onDelete,
}: {
  message: Message;
  grouped: boolean;
  authorName: string;
  authorAvatar: string | null;
  mine: boolean;
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
        <p className="whitespace-pre-wrap break-words text-[13px] text-foreground-secondary">
          {message.body}
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
