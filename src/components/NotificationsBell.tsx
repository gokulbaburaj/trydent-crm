"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Bell, Check, CheckCheck, MessageSquare, MonitorSmartphone } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Tip } from "@/components/ui/Tooltip";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  comment: MessageSquare,
  approval: CheckCheck,
  portal: MonitorSmartphone,
};

/** Topbar bell: unread count, inbox popover, mark-read, click-through links. */
export function NotificationsBell() {
  const router = useRouter();
  const { profile } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || !profile) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notification[]) ?? []);
  }, [profile]);

  useEffect(() => {
    queueMicrotask(load);
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n))
    );
    const supabase = createClient();
    if (!supabase) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
  }

  if (!profile || profile.role === "client") return null;

  return (
    <Popover
      align="right"
      className="w-[340px] p-0"
      trigger={
        <span>
          <Tip label="Notifications">
            <button
              onClick={load}
              className="relative rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </Tip>
        </span>
      }
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-[13px] font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[380px] overflow-y-auto p-1">
            {items.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing yet — client comments, approvals, and portal opens land here.
              </p>
            )}
            {items.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    markRead([n.id]);
                    close();
                    if (n.link) router.push(n.link);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/5",
                    !n.read_at && "bg-primary/[0.06]"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      n.read_at ? "bg-white/5 text-muted-foreground" : "bg-primary/15 text-primary"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] leading-snug",
                        n.read_at ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {n.body}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-2">
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}
