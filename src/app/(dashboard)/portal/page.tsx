"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, ChevronDown, ChevronRight, Eye, LogOut, Megaphone, MessageSquare, Send } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { useCurrency } from "@/lib/currency";
import type { Client, Deal, ClientPortal, PortalUpdate, Project, ProjectTask, TaskComment } from "@/lib/types";

export default function ClientPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>
      }
    >
      <PortalInner />
    </Suspense>
  );
}

function PortalInner() {
  const { profile, signOut } = useAuth();
  const searchParams = useSearchParams();
  // Staff can preview any client's portal via /portal?client=<id>
  const previewClientId =
    profile && profile.role !== "client" ? searchParams.get("client") : null;
  const isPreview = !!previewClientId;
  const { format: formatCurrency } = useCurrency();
  const [client, setClient] = useState<Client | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [portal, setPortal] = useState<ClientPortal | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [updates, setUpdates] = useState<PortalUpdate[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const clientId = previewClientId ?? profile?.client_id;
      if (!supabase || !clientId) {
        setLoading(false);
        return;
      }

      const [clientRes, dealsRes, portalRes, projectsRes, tasksRes, updatesRes, commentsRes] =
        await Promise.all([
          supabase.from("clients").select("*").eq("id", clientId).single(),
          supabase.from("deals").select("*").eq("client_id", clientId),
          supabase.from("client_portals").select("*").eq("client_id", clientId).maybeSingle(),
          supabase.from("projects").select("*").eq("client_id", clientId),
          supabase.from("project_tasks").select("*"),
          supabase
            .from("portal_updates")
            .select("*")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
          supabase.from("task_comments").select("*").order("created_at", { ascending: true }),
        ]);

      setClient((clientRes.data as Client) ?? null);
      setDeals((dealsRes.data as Deal[]) ?? []);
      setPortal((portalRes.data as ClientPortal) ?? null);
      setProjects((projectsRes.data as Project[]) ?? []);
      setTasks((tasksRes.data as ProjectTask[]) ?? []);
      setUpdates((updatesRes.data as PortalUpdate[]) ?? []);
      setComments((commentsRes.data as TaskComment[]) ?? []);
      setLoading(false);

      // Record that the client opened their portal (staff previews don't count).
      if (profile?.role === "client") {
        await supabase.rpc("touch_portal");
      }
    }
    load();
  }, [profile, previewClientId]);

  const tasksOf = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const t of tasks) {
      const arr = map.get(t.project_id) ?? [];
      arr.push(t);
      map.set(t.project_id, arr);
    }
    return map;
  }, [tasks]);

  async function approveTask(taskId: string) {
    const supabase = createClient();
    if (!supabase) return;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, approved_at: new Date().toISOString() } : t
      )
    );
    await supabase.rpc("approve_task", { p_task_id: taskId });
  }

  async function addComment(taskId: string) {
    const body = draft.trim();
    if (!body || !profile) return;
    setDraft("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, author_id: profile.id, body })
      .select()
      .single();
    if (!error && data) setComments((prev) => [...prev, data as TaskComment]);
  }

  function completionOf(projectId: string) {
    const active = (tasksOf.get(projectId) ?? []).filter((t) => t.status !== "Archived");
    if (active.length === 0) return null;
    return (active.filter((t) => t.status === "Done").length / active.length) * 100;
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-medium text-primary-foreground">
            TL
          </div>
          <span className="text-[13px] font-medium text-foreground">Trydent Labs</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">{client?.company ?? "Client Portal"}</span>
          {isPreview && (
            <span className="ml-2 inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
              <Eye className="h-3 w-3" /> Preview — what your client sees
            </span>
          )}
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="animate-page mx-auto flex max-w-4xl flex-col gap-6 p-6">
        {!client ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t linked to a client record yet. Please contact your
              account manager at Trydent Labs.
            </p>
          </Card>
        ) : (
          <>
            {/* Welcome */}
            <div className="border-l-2 border-primary pl-4">
              <h1 className="text-xl font-semibold tracking-tight">
                Welcome to your client portal, {client.point_person || client.company}!
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                Here you can follow progress on your projects, see what&apos;s being worked on
                right now, and keep track of payments — all in one place. Reach out to your
                account manager any time you need a hand.
              </p>
            </div>

            {/* Updates from the team */}
            {updates.length > 0 && (
              <section>
                <h2 className="mb-3 text-[15px] font-semibold">Updates from your team</h2>
                <div className="flex flex-col gap-2">
                  {updates.map((u, i) => (
                    <Card key={u.id} className={i === 0 ? "border-primary/25" : ""}>
                      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Megaphone className="h-3 w-3 text-primary" />
                        {formatDistanceToNow(parseISO(u.created_at), { addSuffix: true })}
                      </div>
                      <p className="text-sm leading-relaxed">{u.body}</p>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Projects */}
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">Projects</h2>
              {projects.length === 0 ? (
                <Card>
                  <p className="py-4 text-center text-sm text-muted-foreground">No projects yet.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((p) => {
                    const pct = completionOf(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setOpenProject(openProject === p.id ? null : p.id)}
                        className="rounded border border-border bg-surface p-3.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          <Badge tone={statusTone(p.status)} dot>
                            {p.status}
                          </Badge>
                        </div>
                        {pct !== null && (
                          <div className="mt-3 flex items-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {pct.toFixed(0)}%
                            </span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full bg-success"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {p.due_date && (
                          <p className="mt-2 text-xs text-muted-foreground">Due {formatDate(p.due_date)}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Tasks grouped by project */}
            {projects.length > 0 && (
              <section>
                <h2 className="mb-3 text-[15px] font-semibold">Task progress</h2>
                <div className="overflow-hidden rounded border border-border bg-surface">
                  {projects.map((p) => {
                    const pts = (tasksOf.get(p.id) ?? []).filter((t) => t.status !== "Archived");
                    const open = openProject === p.id;
                    return (
                      <div key={p.id} className="border-b border-border-subtle last:border-0">
                        <button
                          onClick={() => setOpenProject(open ? null : p.id)}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-white/[0.03]"
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {p.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {pts.filter((t) => t.status === "Done").length}/{pts.length} done
                          </span>
                        </button>
                        {open && (
                          <div className="flex flex-col border-t border-border-subtle">
                            {pts.length === 0 && (
                              <p className="px-9 py-3 text-xs text-muted-foreground">No tasks yet.</p>
                            )}
                            {pts.map((t) => {
                              const tComments = comments.filter((c) => c.task_id === t.id);
                              const expanded = expandedTask === t.id;
                              return (
                                <div key={t.id} className="border-t border-border-subtle first:border-0">
                                  <div className="flex items-center gap-3 px-9 py-2 text-sm">
                                    <Badge tone={statusTone(t.status)} dot>
                                      {t.status}
                                    </Badge>
                                    <span
                                      className={`min-w-0 flex-1 truncate ${
                                        t.status === "Done" ? "text-muted-foreground line-through" : ""
                                      }`}
                                    >
                                      {t.name}
                                    </span>
                                    {t.approved_at ? (
                                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                                        <CheckCheck className="h-3 w-3" /> Approved
                                      </span>
                                    ) : t.status === "Done" && profile?.role === "client" ? (
                                      <button
                                        onClick={() => approveTask(t.id)}
                                        className="shrink-0 rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success transition-colors hover:bg-success/20"
                                      >
                                        Approve
                                      </button>
                                    ) : null}
                                    <button
                                      onClick={() => {
                                        setExpandedTask(expanded ? null : t.id);
                                        setDraft("");
                                      }}
                                      className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-white/5 ${
                                        tComments.length > 0 || expanded
                                          ? "text-foreground-secondary"
                                          : "text-muted-foreground"
                                      }`}
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      {tComments.length > 0 && tComments.length}
                                    </button>
                                    {t.due_date && (
                                      <span className="shrink-0 text-xs text-muted-foreground">
                                        {formatDate(t.due_date)}
                                      </span>
                                    )}
                                  </div>
                                  {expanded && (
                                    <div className="flex flex-col gap-2 px-9 pb-3">
                                      {tComments.map((c) => (
                                        <div
                                          key={c.id}
                                          className="rounded-md border border-border-subtle bg-white/[0.02] px-2.5 py-1.5"
                                        >
                                          <p className="text-[13px] leading-snug">{c.body}</p>
                                          <p className="mt-0.5 text-[10px] text-muted-2">
                                            {formatDistanceToNow(parseISO(c.created_at), {
                                              addSuffix: true,
                                            })}
                                          </p>
                                        </div>
                                      ))}
                                      <form
                                        onSubmit={(e) => {
                                          e.preventDefault();
                                          addComment(t.id);
                                        }}
                                        className="flex items-center gap-2"
                                      >
                                        <Input
                                          placeholder="Write a comment for the team..."
                                          value={draft}
                                          onChange={(e) => setDraft(e.target.value)}
                                        />
                                        <Button
                                          type="submit"
                                          size="sm"
                                          variant="secondary"
                                          disabled={!draft.trim()}
                                        >
                                          <Send className="h-3.5 w-3.5" />
                                        </Button>
                                      </form>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Payments */}
            <section>
              <h2 className="mb-3 text-[15px] font-semibold">Payments</h2>
              <div className="overflow-hidden rounded border border-border bg-surface">
                {deals.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No engagements yet.</p>
                )}
                {deals.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-3.5 py-2.5 text-sm last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{d.deal_name}</span>
                    <Badge tone={statusTone(d.deal_stage)}>{d.deal_stage}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(Number(d.paid))} paid of {formatCurrency(Number(d.deal_value))}
                    </span>
                    {d.close_date && (
                      <span className="text-xs text-muted-foreground">Close {formatDate(d.close_date)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {portal?.notes && (
              <Card>
                <h3 className="mb-1.5 text-sm font-semibold text-muted-foreground">Notes from your team</h3>
                <p className="text-sm">{portal.notes}</p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
