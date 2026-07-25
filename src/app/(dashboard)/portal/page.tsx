"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Eye,
  FileText,
  FolderKanban,
  FolderOpen,
  GanttChartSquare,
  ListChecks,
  LogOut,
  Megaphone,
  MessageSquare,
  Send,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PortalBoard,
  PortalCalendar,
  PortalTimeline,
  type PortalView,
} from "@/components/portal/PortalTaskViews";
import { format, formatDistanceToNow, parseISO, startOfDay } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Input, Label } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useCurrency } from "@/lib/currency";
import type {
  Activity,
  Client,
  ClientDocument,
  CurrencyCode,
  ClientPortal,
  Invoice,
  InvoiceDisplayStatus,
  MeetingRequest,
  PortalMessage,
  PortalUpdate,
  Project,
  ProjectTask,
  TaskComment,
  TaskLink,
  TeamMember,
} from "@/lib/types";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
} from "@/lib/types";

const PORTAL_VIEWS: { id: PortalView; label: string; icon: LucideIcon }[] = [
  { id: "list", label: "List", icon: ListChecks },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "timeline", label: "Timeline", icon: GanttChartSquare },
];

const PORTAL_INVOICE_TONES: Record<InvoiceDisplayStatus, "gray" | "blue" | "green" | "red"> = {
  draft: "gray",
  sent: "blue",
  paid: "green",
  overdue: "red",
};

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
  const { format: formatCurrency, toBase, base } = useCurrency();
  const [client, setClient] = useState<Client | null>(null);
  const [portal, setPortal] = useState<ClientPortal | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [updates, setUpdates] = useState<PortalUpdate[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [msgDraft, setMsgDraft] = useState("");
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [meetings, setMeetings] = useState<Activity[]>([]);
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const [askTopic, setAskTopic] = useState("");
  const [askDate, setAskDate] = useState<string | null>(null);
  const [askNote, setAskNote] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openProject, setOpenProject] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [view, setView] = useState<PortalView>("list");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const clientId = previewClientId ?? profile?.client_id;
      if (!supabase || !clientId) {
        setLoading(false);
        return;
      }

      const [
        clientRes,
        portalRes,
        projectsRes,
        tasksRes,
        updatesRes,
        commentsRes,
        messagesRes,
        documentsRes,
        invoicesRes,
        teamRes,
        meetingsRes,
        requestsRes,
      ] = await Promise.all([
          supabase.from("clients").select("*").eq("id", clientId).single(),
          supabase.from("client_portals").select("*").eq("client_id", clientId).maybeSingle(),
          supabase.from("projects").select("*").eq("client_id", clientId),
          supabase.from("project_tasks").select("*"),
          supabase
            .from("portal_updates")
            .select("*")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
          supabase.from("task_comments").select("*").order("created_at", { ascending: true }),
          supabase
            .from("portal_messages")
            .select("*")
            .eq("client_id", clientId)
            .order("created_at", { ascending: true }),
          supabase
            .from("client_documents")
            .select("*")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
          supabase
            .from("invoices")
            .select("*")
            .eq("client_id", clientId)
            .order("issue_date", { ascending: false, nullsFirst: false }),
          supabase.from("team_directory").select("*"),
          supabase
            .from("activities")
            .select("*")
            .eq("client_id", clientId)
            .eq("client_visible", true)
            .order("activity_date", { ascending: true }),
          supabase
            .from("meeting_requests")
            .select("*")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false }),
        ]);

      setClient((clientRes.data as Client) ?? null);
      setPortal((portalRes.data as ClientPortal) ?? null);
      setProjects((projectsRes.data as Project[]) ?? []);
      setTasks((tasksRes.data as ProjectTask[]) ?? []);
      setUpdates((updatesRes.data as PortalUpdate[]) ?? []);
      setComments((commentsRes.data as TaskComment[]) ?? []);
      setMessages((messagesRes.data as PortalMessage[]) ?? []);
      setDocuments((documentsRes.data as ClientDocument[]) ?? []);
      setInvoices((invoicesRes.data as Invoice[]) ?? []);
      setTeam((teamRes.data as TeamMember[]) ?? []);
      setMeetings((meetingsRes.data as Activity[]) ?? []);
      setRequests((requestsRes.data as MeetingRequest[]) ?? []);
      setLoading(false);

      // Record that the client opened their portal (staff previews don't count).
      if (profile?.role === "client") {
        await supabase.rpc("touch_portal");
      }
    }
    load();
  }, [profile, previewClientId]);

  const projectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  // Scope tasks to this client's projects — matters in staff preview, where the
  // query returns every project's tasks (a real client only sees their own via RLS).
  const clientTasks = useMemo(
    () => tasks.filter((t) => projectIds.has(t.project_id) && t.status !== "Archived"),
    [tasks, projectIds]
  );

  const tasksOf = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    for (const t of clientTasks) {
      const arr = map.get(t.project_id) ?? [];
      arr.push(t);
      map.set(t.project_id, arr);
    }
    return map;
  }, [clientTasks]);

  /* ---- dashboard stats ---- */
  const doneCount = clientTasks.filter((t) => t.status === "Done").length;
  const overallPct = clientTasks.length ? Math.round((doneCount / clientTasks.length) * 100) : 0;
  const approvedCount = clientTasks.filter((t) => t.approved_at).length;
  const activeProjects = projects.filter((p) => p.status !== "Delivered").length;

  const nextDeadline = useMemo(() => {
    const today = startOfDay(new Date());
    const dates = [
      ...projects.map((p) => p.due_date),
      ...clientTasks.map((t) => t.due_date),
    ]
      .filter((d): d is string => !!d)
      .filter((d) => parseISO(d) >= today)
      .sort();
    return dates[0] ?? null;
  }, [projects, clientTasks]);

  /** Finished work only. A link on an in-progress task isn't a deliverable yet,
   *  and showing it invites the client to open something half-built. */
  const deliverables = useMemo(() => {
    const out: { task: ProjectTask; link: TaskLink }[] = [];
    for (const t of clientTasks) {
      if (t.status !== "Done") continue;
      const links = Array.isArray(t.links) ? t.links : [];
      for (const l of links) out.push({ task: t, link: l });
    }
    return out;
  }, [clientTasks]);

  const teamById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  /** Everyone assigned to at least one task on a project, de-duplicated and in
   *  a stable order so the avatar stack doesn't reshuffle between renders. */
  const projectTeam = useMemo(() => {
    const map = new Map<string, TeamMember[]>();
    for (const p of projects) {
      const seen = new Set<string>();
      const people: TeamMember[] = [];
      for (const t of clientTasks) {
        if (t.project_id !== p.id || !t.assigned_to || seen.has(t.assigned_to)) continue;
        const member = teamById.get(t.assigned_to);
        if (!member) continue;
        seen.add(t.assigned_to);
        people.push(member);
      }
      map.set(p.id, people);
    }
    return map;
  }, [projects, clientTasks, teamById]);

  const upcomingMeetings = useMemo(() => {
    const cutoff = startOfDay(new Date()).getTime();
    return meetings
      .filter((m) => parseISO(m.activity_date).getTime() >= cutoff)
      .slice(0, 5);
  }, [meetings]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );

  async function requestMeeting() {
    const topic = askTopic.trim();
    if (!topic || !profile?.client_id) return;
    setAskBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setAskBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("meeting_requests")
      .insert({
        client_id: profile.client_id,
        requested_by: profile.id,
        topic,
        preferred_date: askDate,
        note: askNote.trim() || null,
      })
      .select()
      .single();
    setAskBusy(false);
    if (error || !data) return;
    setRequests((prev) => [data as MeetingRequest, ...prev]);
    setAskTopic("");
    setAskDate(null);
    setAskNote("");
    setAskOpen(false);
  }

  /** Everyone touching any of this client's work, across all projects. */
  const accountTeam = useMemo(() => {
    const seen = new Set<string>();
    const people: TeamMember[] = [];
    for (const list of projectTeam.values()) {
      for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        people.push(m);
      }
    }
    return people;
  }, [projectTeam]);

  /** Drafts are hidden by RLS for real clients; filter again so staff previews
   *  see exactly what the client sees. */
  const visibleInvoices = useMemo(
    () => invoices.filter((i) => i.status !== "draft"),
    [invoices]
  );

  const invoiceTotals = useMemo(() => {
    let invoiced = 0;
    let paid = 0;
    let overdue = 0;
    for (const inv of visibleInvoices) {
      const amount = toBase(Number(inv.amount), (inv.currency as CurrencyCode) ?? base);
      invoiced += amount;
      if (inv.status === "paid") paid += amount;
      if (effectiveInvoiceStatus(inv) === "overdue") overdue += 1;
    }
    return { invoiced, paid, outstanding: invoiced - paid, overdue };
  }, [visibleInvoices, toBase, base]);

  const invoicedTotal = invoiceTotals.invoiced;
  const invoicePaid = invoiceTotals.paid;
  const invoiceOutstanding = invoiceTotals.outstanding;
  const overdueCount = invoiceTotals.overdue;
  const invoicePaidPct =
    invoicedTotal > 0 ? Math.round((invoicePaid / invoicedTotal) * 100) : 0;

  /** Documents in a stable category order, empty categories omitted. */
  const groupedDocs = useMemo(
    () =>
      DOCUMENT_CATEGORIES.map((c) => ({
        category: c,
        items: documents.filter((d) => d.category === c),
      })).filter((g) => g.items.length > 0),
    [documents]
  );

  const awaitingApproval = useMemo(
    () => clientTasks.filter((t) => t.status === "Done" && !t.approved_at),
    [clientTasks]
  );

  async function sendMessage() {
    const body = msgDraft.trim();
    if (!body || !profile) return;
    setMsgDraft("");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("portal_messages")
      .insert({ client_id: profile.client_id, author_id: profile.id, body })
      .select()
      .single();
    if (!error && data) setMessages((prev) => [...prev, data as PortalMessage]);
  }

  async function approveTask(taskId: string) {
    const supabase = createClient();
    if (!supabase) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, approved_at: new Date().toISOString() } : t))
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
    const active = tasksOf.get(projectId) ?? [];
    if (active.length === 0) return null;
    return (active.filter((t) => t.status === "Done").length / active.length) * 100;
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const greetingName = client?.point_person || client?.company || "there";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3.5 backdrop-blur">
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

      <main className="animate-page mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {!client ? (
          <Card>
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t linked to a client record yet. Please contact your
              account manager at Trydent Labs.
            </p>
          </Card>
        ) : (
          <>
            {/* ============ HERO DASHBOARD ============ */}
            <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm">
              <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Your project hub</span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  Welcome back, {greetingName}
                </h1>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Everything happening on your account — progress, deliverables, and payments —
                  in one place. Reach out to your account manager any time.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat
                    icon={FolderKanban}
                    value={String(activeProjects)}
                    label={activeProjects === 1 ? "Active project" : "Active projects"}
                  />
                  <Stat icon={CheckCircle2} value={`${overallPct}%`} label="Overall progress" />
                  <Stat icon={CheckCheck} value={String(approvedCount)} label="Approved" />
                  <Stat
                    icon={Wallet}
                    value={formatCurrency(invoiceOutstanding)}
                    label="Outstanding"
                  />
                  <Stat
                    icon={CalendarClock}
                    value={nextDeadline ? formatDate(nextDeadline) : "—"}
                    label="Next deadline"
                  />
                </div>
              </div>
            </section>

            {/* ============ TWO-COLUMN: main + right rail ============ */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-6">
            {/* ============ PROJECTS ============ */}
            <section>
              <SectionTitle icon={FolderKanban}>Projects</SectionTitle>
              {projects.length === 0 ? (
                <Card className="rounded-xl shadow-sm">
                  <p className="py-4 text-center text-sm text-muted-foreground">No projects yet.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((p) => {
                    const pct = completionOf(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setOpenProject(p.id);
                          document
                            .getElementById("task-progress")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="group rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          <Badge tone={statusTone(p.status)} dot>
                            {p.status}
                          </Badge>
                        </div>
                        {pct !== null && (
                          <div className="mt-3.5 flex items-center gap-2">
                            <span className="w-9 shrink-0 text-xs font-medium tabular-nums text-foreground-secondary">
                              {pct.toFixed(0)}%
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pct >= 100 ? "bg-success" : "bg-primary"
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate">
                            {p.due_date ? `Due ${formatDate(p.due_date)}` : "No deadline set"}
                          </span>
                          <div className="ml-auto flex items-center gap-1.5">
                            <AvatarStack people={projectTeam.get(p.id) ?? []} />
                            <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ============ TASK PROGRESS ============ */}
            {projects.length > 0 && (
              <section id="task-progress" className="scroll-mt-20">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <SectionTitle icon={CheckCircle2} className="mb-0">
                    Task progress
                  </SectionTitle>
                  <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
                    {PORTAL_VIEWS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setView(id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
                          view === id
                            ? "bg-white/10 font-medium text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {view === "board" && (
                  <PortalBoard
                    tasks={clientTasks}
                    projects={projects}
                    projectName={projectName}
                    teamById={teamById}
                  />
                )}
                {view === "calendar" && (
                  <PortalCalendar
                    tasks={clientTasks}
                    projects={projects}
                    projectName={projectName}
                    teamById={teamById}
                  />
                )}
                {view === "timeline" && (
                  <PortalTimeline
                    tasks={clientTasks}
                    projects={projects}
                    projectName={projectName}
                    teamById={teamById}
                  />
                )}

                <div
                  className={cn(
                    "overflow-hidden rounded-xl border border-border bg-surface shadow-sm",
                    view !== "list" && "hidden"
                  )}
                >
                  {projects.map((p) => {
                    const pts = tasksOf.get(p.id) ?? [];
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
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                          <AvatarStack people={projectTeam.get(p.id) ?? []} />
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
                                      className={cn(
                                        "min-w-0 flex-1 truncate",
                                        t.status === "Done" && "text-muted-foreground line-through"
                                      )}
                                    >
                                      {t.name}
                                    </span>
                                    {t.assigned_to && teamById.get(t.assigned_to) && (
                                      <div
                                        title={teamById.get(t.assigned_to)!.full_name}
                                        className="shrink-0"
                                      >
                                        <Avatar
                                          name={teamById.get(t.assigned_to)!.full_name}
                                          url={teamById.get(t.assigned_to)!.avatar_url}
                                          size="xs"
                                        />
                                      </div>
                                    )}
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
                                      className={cn(
                                        "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-white/5",
                                        tComments.length > 0 || expanded
                                          ? "text-foreground-secondary"
                                          : "text-muted-foreground"
                                      )}
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

            {/* ============ DELIVERABLES ============ */}
            {deliverables.length > 0 && (
              <section>
                <SectionTitle icon={FileText}>Deliverables</SectionTitle>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {deliverables.map(({ task, link }, i) => (
                    <a
                      key={`${task.id}-${i}`}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-white/[0.04]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {link.title}
                          {task.approved_at && <CheckCheck className="h-3 w-3 shrink-0 text-success" />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {projectName(task.project_id)} · {task.name}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* ============ MEETINGS ============ */}
            <section>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <SectionTitle icon={CalendarClock} className="mb-0">
                  Meetings
                </SectionTitle>
                {profile?.role === "client" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    onClick={() => setAskOpen((o) => !o)}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Request a call
                  </Button>
                )}
              </div>

              {askOpen && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    requestMeeting();
                  }}
                  className="mb-3 flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm"
                >
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <div>
                      <Label>What would you like to discuss?</Label>
                      <Input
                        placeholder="Campaign review"
                        value={askTopic}
                        onChange={(e) => setAskTopic(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Preferred date (optional)</Label>
                      <DatePicker value={askDate} onChange={setAskDate} placeholder="Any time" />
                    </div>
                  </div>
                  <div>
                    <Label>Anything else? (optional)</Label>
                    <Input
                      placeholder="Mornings work best for us"
                      value={askNote}
                      onChange={(e) => setAskNote(e.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={askBusy || !askTopic.trim()}>
                    {askBusy ? "Sending..." : "Send request"}
                  </Button>
                </form>
              )}

              {pendingRequests.length > 0 && (
                <div className="mb-3 flex flex-col gap-1.5">
                  {pendingRequests.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="min-w-0 flex-1 truncate">{r.topic}</span>
                      <span className="text-xs text-warning">Awaiting a time from your team</span>
                    </div>
                  ))}
                </div>
              )}

              {upcomingMeetings.length === 0 ? (
                <Card className="rounded-xl shadow-sm">
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No meetings scheduled.
                  </p>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcomingMeetings.map((m) => {
                    const attendees = (m.attendee_ids ?? [])
                      .map((id) => teamById.get(id))
                      .filter((p): p is TeamMember => !!p);
                    return (
                      <Card key={m.id} className="rounded-xl shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {m.description}
                          </span>
                          <AvatarStack people={attendees} size="sm" />
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {format(parseISO(m.activity_date), "EEE d MMM · h:mm a")}
                          </span>
                        </div>
                        {m.location && (
                          <p className="mt-1 text-xs text-muted-foreground">{m.location}</p>
                        )}
                        {m.agenda && (
                          <p className="mt-2 whitespace-pre-line border-t border-border-subtle pt-2 text-[13px] leading-snug text-foreground-secondary">
                            {m.agenda}
                          </p>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ============ DOCUMENTS ============ */}
            {groupedDocs.length > 0 && (
              <section>
                <SectionTitle icon={FolderOpen}>Documents</SectionTitle>
                <div className="flex flex-col gap-4">
                  {groupedDocs.map(({ category, items }) => (
                    <div key={category}>
                      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-2">
                        {DOCUMENT_CATEGORY_LABELS[category]}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {items.map((d) => (
                          <a
                            key={d.id}
                            href={d.url ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-colors hover:border-primary/30 hover:bg-white/[0.04]"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{d.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                Added {formatDate(d.created_at)}
                              </p>
                            </div>
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ============ PAYMENTS ============ */}
            <section>
              <SectionTitle icon={Wallet}>Payments</SectionTitle>
              {visibleInvoices.length === 0 ? (
                <Card className="rounded-xl shadow-sm">
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No invoices yet. Anything your team issues will appear here.
                  </p>
                </Card>
              ) : (
                <Card className="rounded-xl shadow-sm">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3 border-b border-border-subtle pb-4">
                    <Summary label="Invoiced" value={formatCurrency(invoicedTotal)} />
                    <Summary label="Paid" value={formatCurrency(invoicePaid)} tone="success" />
                    <Summary
                      label="Outstanding"
                      value={formatCurrency(invoiceOutstanding)}
                      tone={overdueCount > 0 ? "danger" : "warning"}
                    />
                  </div>
                  <div className="flex items-center gap-3 py-3.5">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${invoicePaidPct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {invoicePaidPct}% paid
                    </span>
                  </div>
                  {overdueCount > 0 && (
                    <p className="mb-1 text-xs font-medium text-danger">
                      {overdueCount} invoice{overdueCount === 1 ? " is" : "s are"} past due.
                    </p>
                  )}
                  {/* Per-invoice breakdown */}
                  <div className="flex flex-col divide-y divide-border-subtle">
                    {visibleInvoices.map((inv) => {
                      const display = effectiveInvoiceStatus(inv);
                      const row = (
                        <>
                          <span className="min-w-0 flex-1 truncate font-medium">{inv.number}</span>
                          <Badge tone={PORTAL_INVOICE_TONES[display]}>
                            {INVOICE_STATUS_LABELS[display]}
                          </Badge>
                          <span
                            className={cn(
                              "text-xs",
                              display === "overdue" ? "text-danger" : "text-muted-foreground"
                            )}
                          >
                            {inv.due_date ? `Due ${formatDate(inv.due_date)}` : "No due date"}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(Number(inv.amount), inv.currency)}
                          </span>
                          {inv.document_url && (
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                          )}
                        </>
                      );
                      return inv.document_url ? (
                        <a
                          key={inv.id}
                          href={inv.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm transition-colors hover:text-primary"
                        >
                          {row}
                        </a>
                      ) : (
                        <div
                          key={inv.id}
                          className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm"
                        >
                          {row}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </section>

            {portal?.notes && (
              <Card className="rounded-xl shadow-sm">
                <h3 className="mb-1.5 text-sm font-semibold text-muted-foreground">Notes from your team</h3>
                <p className="text-sm">{portal.notes}</p>
              </Card>
            )}
              </div>

              {/* ============ RIGHT RAIL ============ */}
              <aside className="flex flex-col gap-4 lg:sticky lg:top-[76px] lg:self-start">
                {/* Awaiting your approval */}
                {awaitingApproval.length > 0 && (
                  <Card className="rounded-xl border-warning/30 shadow-sm">
                    <div className="mb-2.5 flex items-center gap-2">
                      <CheckCheck className="h-4 w-4 text-warning" />
                      <h3 className="text-sm font-semibold">Awaiting your approval</h3>
                      <span className="ml-auto rounded-full bg-warning/15 px-1.5 py-px text-[11px] font-medium text-warning">
                        {awaitingApproval.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {awaitingApproval.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-2 rounded-md border border-border-subtle bg-white/[0.02] px-2.5 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px]">{t.name}</span>
                          {profile?.role === "client" ? (
                            <button
                              onClick={() => approveTask(t.id)}
                              className="shrink-0 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[11px] font-medium text-success transition-colors hover:bg-success/20"
                            >
                              Approve
                            </button>
                          ) : (
                            <span className="shrink-0 text-[11px] text-muted-foreground">pending</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Announcements */}
                <Card className="rounded-xl shadow-sm">
                  <div className="mb-2.5 flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Announcements</h3>
                  </div>
                  {updates.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No announcements yet — updates from your team will appear here.
                    </p>
                  ) : (
                    <div className="flex flex-col divide-y divide-border-subtle">
                      {updates.slice(0, 6).map((u, i) => (
                        <div key={u.id} className={cn("py-2.5 first:pt-0 last:pb-0")}>
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {i === 0 && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            )}
                            {formatDistanceToNow(parseISO(u.created_at), { addSuffix: true })}
                          </div>
                          <p className="text-[13px] leading-relaxed">{u.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Messages */}
                <Card className="flex max-h-[440px] flex-col rounded-xl shadow-sm">
                  <div className="mb-2.5 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Messages</h3>
                    <span className="ml-auto text-[11px] text-muted-foreground">with your team</span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
                    {messages.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">
                        Start a conversation — your account manager will get notified.
                      </p>
                    )}
                    {messages.map((m) => {
                      const mine = m.author_id === profile?.id;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "max-w-[85%] rounded-lg px-2.5 py-1.5",
                            mine
                              ? "self-end bg-primary/15 text-foreground"
                              : "self-start border border-border-subtle bg-white/[0.03]"
                          )}
                        >
                          <p className="text-[13px] leading-snug">{m.body}</p>
                          <p className="mt-0.5 text-[10px] text-muted-2">
                            {mine ? "You" : "Trydent Labs"} ·{" "}
                            {formatDistanceToNow(parseISO(m.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {profile?.role === "client" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage();
                      }}
                      className="mt-3 flex items-center gap-2"
                    >
                      <Input
                        placeholder="Message your team..."
                        value={msgDraft}
                        onChange={(e) => setMsgDraft(e.target.value)}
                      />
                      <Button type="submit" size="sm" variant="secondary" disabled={!msgDraft.trim()}>
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  )}
                </Card>

                {/* Your team */}
                {accountTeam.length > 0 && (
                  <Card className="rounded-xl shadow-sm">
                    <div className="mb-2.5 flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Your team</h3>
                    </div>
                    <div className="flex flex-col gap-2">
                      {accountTeam.map((m) => (
                        <div key={m.id} className="flex items-center gap-2.5">
                          <Avatar name={m.full_name} url={m.avatar_url} size="sm" />
                          <span className="min-w-0 truncate text-[13px]">{m.full_name}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------- Pieces ---------------------------------- */

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/70 px-3.5 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold leading-tight tabular-nums">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn("mb-3 flex items-center gap-2 text-[15px] font-semibold", className)}>
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </h2>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </p>
    </div>
  );
}
