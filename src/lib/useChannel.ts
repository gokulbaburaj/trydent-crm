"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";

/**
 * One channel's messages: a page of history, a realtime subscription, and an
 * optimistic send.
 *
 * Deliberately NOT built on `useSupabaseTable`. That hook fetches an entire
 * table and caches it, which is fine for 26 deals and catastrophic here —
 * `messages` is the first table in this app that grows without bound. A year of
 * chat would be downloaded on every page load. So this pages backwards from
 * newest with a `created_at` cursor and never holds more than what's been
 * scrolled to.
 */

/** Rows per fetch. Enough to fill a tall window so the first scroll isn't instant. */
const PAGE = 50;

interface ChannelState {
  /**
   * Which channel this state belongs to.
   *
   * Carried inside the state on purpose. Switching channels has to blank the
   * list, and doing that with `setMessages([])` inside an effect trips
   * react-hooks/set-state-in-effect — worse, it paints one frame of the old
   * channel's messages under the new channel's name. Storing the id alongside
   * lets the switch be derived during render, which is both instant and legal.
   */
  cid: string | null;
  messages: Message[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
}

const emptyFor = (cid: string | null): ChannelState => ({
  cid,
  messages: [],
  loading: cid !== null,
  hasMore: true,
  error: null,
});

export interface UseChannel {
  messages: Message[];
  loading: boolean;
  /** False once a fetch returns fewer rows than it asked for. */
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  send: (body: string, mentions?: Message["mentions"]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  error: string | null;
}

export function useChannel(channelId: string | null, authorId: string | null): UseChannel {
  const [state, setState] = useState<ChannelState>(() => emptyFor(channelId));
  const [loadingOlder, setLoadingOlder] = useState(false);

  // The switch, derived. State for the wrong channel is simply not shown.
  const view = state.cid === channelId ? state : emptyFor(channelId);

  /*
   * Ids already placed, so the realtime echo of our own insert doesn't arrive
   * as a second copy. A ref because it's read inside a subscription callback
   * and must never cause a render of its own.
   */
  const seen = useRef<Set<string>>(new Set());

  /** Merge into the right channel only, keeping order and never duplicating. */
  const merge = useCallback((cid: string, incoming: Message[]) => {
    setState((prev) => {
      if (prev.cid !== cid) return prev; // reply for a channel we've left
      const fresh = incoming.filter((m) => !prev.messages.some((p) => p.id === m.id));
      if (fresh.length === 0) return prev;
      return {
        ...prev,
        messages: [...prev.messages, ...fresh].sort((a, b) =>
          a.created_at.localeCompare(b.created_at)
        ),
      };
    });
  }, []);

  // Initial page ------------------------------------------------------------
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    seen.current = new Set();

    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE);

      if (cancelled) return;
      if (error) {
        setState({ ...emptyFor(channelId), loading: false, error: error.message });
        return;
      }
      const rows = (data ?? []) as Message[];
      rows.forEach((r) => seen.current.add(r.id));
      setState({
        cid: channelId,
        // Fetched newest-first to honour the limit; displayed oldest-first.
        messages: [...rows].reverse(),
        loading: false,
        hasMore: rows.length === PAGE,
        error: null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Realtime ----------------------------------------------------------------
  useEffect(() => {
    if (!channelId) return;
    const supabase = createClient();
    if (!supabase) return;

    /*
     * Realtime respects RLS, so this socket only delivers rows the caller could
     * have selected anyway. The server-side filter still matters: without it
     * every client wakes for every message in the workspace.
     */
    const sub = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const row = payload.new as Message;
          if (!row?.id || seen.current.has(row.id)) return; // our own optimistic insert
          seen.current.add(row.id);
          merge(channelId, [row]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const row = payload.new as Message;
          if (!row?.id) return;
          setState((prev) => {
            if (prev.cid !== channelId) return prev;
            return {
              ...prev,
              // A soft delete arrives as an update; drop it from the list.
              messages: row.deleted_at
                ? prev.messages.filter((m) => m.id !== row.id)
                : prev.messages.map((m) => (m.id === row.id ? row : m)),
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [channelId, merge]);

  // Older page --------------------------------------------------------------
  const loadOlder = useCallback(async () => {
    if (!channelId || !view.hasMore || loadingOlder) return;
    const oldest = view.messages[0]?.created_at;
    if (!oldest) return;

    setLoadingOlder(true);
    const supabase = createClient();
    if (!supabase) {
      setLoadingOlder(false);
      return;
    }
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("channel_id", channelId)
      .is("deleted_at", null)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(PAGE);

    if (error) {
      setState((prev) => (prev.cid === channelId ? { ...prev, error: error.message } : prev));
      setLoadingOlder(false);
      return;
    }
    const rows = (data ?? []) as Message[];
    rows.forEach((r) => seen.current.add(r.id));
    merge(channelId, rows);
    setState((prev) =>
      prev.cid === channelId ? { ...prev, hasMore: rows.length === PAGE } : prev
    );
    setLoadingOlder(false);
  }, [channelId, view.hasMore, view.messages, loadingOlder, merge]);

  // Send --------------------------------------------------------------------
  const send = useCallback(
    async (body: string, mentions: Message["mentions"] = []) => {
      const text = body.trim();
      if (!text || !channelId || !authorId) return;

      /*
       * The id is generated here, not by the database, so the message paints
       * before the round-trip and so the realtime echo can be recognised as
       * ours. A chat that lags while you type feels broken immediately.
       */
      const id = crypto.randomUUID();
      seen.current.add(id);
      merge(channelId, [
        {
          id,
          channel_id: channelId,
          parent_id: null,
          author_id: authorId,
          body: text,
          mentions,
          edited_at: null,
          deleted_at: null,
          created_at: new Date().toISOString(),
        },
      ]);

      const supabase = createClient();
      if (!supabase) return;
      const { error } = await supabase
        .from("messages")
        .insert({ id, channel_id: channelId, author_id: authorId, body: text, mentions });

      if (error) {
        // Take it back off screen rather than leave an unsent message looking sent.
        seen.current.delete(id);
        setState((prev) =>
          prev.cid === channelId
            ? { ...prev, messages: prev.messages.filter((m) => m.id !== id), error: error.message }
            : prev
        );
      }
    },
    [channelId, authorId, merge]
  );

  // Delete ------------------------------------------------------------------
  const remove = useCallback(
    async (id: string) => {
      const supabase = createClient();
      if (!supabase) return;
      setState((prev) =>
        prev.cid === channelId
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== id) }
          : prev
      );
      // Soft delete: a hard delete would cascade to any thread replies.
      const { error } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        setState((prev) => (prev.cid === channelId ? { ...prev, error: error.message } : prev));
      }
    },
    [channelId]
  );

  return {
    messages: view.messages,
    loading: view.loading,
    hasMore: view.hasMore,
    loadingOlder,
    loadOlder,
    send,
    remove,
    error: view.error,
  };
}
