"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { endOfWeek, isBefore, isToday, parseISO, startOfDay } from "date-fns";
import { CalendarClock, CheckCircle2, Eye, LogOut, Sparkles, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { PriorityFlag } from "@/components/ui/PriorityPicker";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { useCurrency } from "@/lib/currency";
import { formatDate, cn } from "@/lib/utils";
import type { Activity, Profile, ProjectTask, StaffPayment, TaskStatus } from "@/lib/types";
import { PRIORITY_ORDER, TASK_STATUSES } from "@/lib/types";

type Bucket = "Overdue" | "Today" | "This Week" | "Later" | "No date";
const BUCKETS: Bucket[] = ["Overdue", "Today", "This Week", "Later", "No date"];

function bucketOf(t: ProjectTask): Bucket {
  if (!t.due_date) return "No date";
  const due = startOfDay(parseISO(t.due_date));
  const today = startOfDay(new Date());
  if (isBefore(due, today)) return "Overdue";
  if (isToday(due)) return "Today";
  if (!isBefore(endOfWeek(today, { weekStartsOn: 1 }), due)) return "This Week";
  return "Later";
}

export default function StaffPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>
      }
    >
      <StaffPortalInner />
    </Suspense>
  );
}

function StaffPortalInner() {
  const { profile, signOut } = useAuth();
  const { format: formatCurrency } = useCurrency();
  const searchParams = useSearchParams();

  // Staff (admin/rep) can preview a contractor's portal via ?user=<profileId>.
  const previewUserId =
    profile && profile.role !== "contractor" ? searchParams.get("user") : null;
  const isPreview = !!previewUserId;
  const targetId = previewUserId ?? profile?.id ?? null;

  // RLS scopes these to the contractor's own rows; for an admin preview it
  // returns more, so we filter down to the target person either way.
  const { rows: allTasks, setRows: setTasks } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: allActivities } = useSupabaseTable<Activity>("activities", {
    column: "activity_date",
    ascending: true,
  });
  const { rows: allPayments } = useSupabaseTable<StaffPayment>("staff_payments");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [savingId, setSavingId] = useState<string | null>(null);

  const tasks = useMemo(
    () => allTasks.filter((t) => t.assigned_to === targetId),
    [allTasks, targetId]
  );
  const activities = useMemo(
    () => allActivities.filter((a) => a.assigned_to === targetId),
    [allActivities, targetId]
  );
  const payments = useMemo(
    () => allPayments.filter((p) => p.profile_id === targetId),
    [allPayments, targetId]
  );

  const openTasks = useMemo(
    () => tasks.filter((t) => t.status !== "Done" && t.status !== "Archived"),
    [tasks]
  );

  const grouped = useMemo(() => {
    const map = new Map<Bucket, ProjectTask[]>();
    for (const b of BUCKETS) map.set(b, []);
    for (const t of openTasks) map.get(bucketOf(t))!.push(t);
    for (const b of BUCKETS) {
      map.get(b)!.sort(
        (a, b2) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b2.priority] ||
          (a.due_date ?? "9999").localeCompare(b2.due_date ?? "9999")
      );
    }
    return map;
  }, [openTasks]);

  const upcoming = useMemo(() => {
    const from = startOfDay(new Date());
    return activities
      .filter((a) => parseISO(a.activity_date) >= from)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 6);
  }, [activities]);

  const dueThisWeek = openTasks.filter((t) => {
    const b = bucketOf(t);
    return b === "Overdue" || b === "Today" || b === "This Week";
  }).length;

  const payTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const payPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = payTotal - payPaid;

  async function updateStatus(id: string, status: TaskStatus) {
    setSavingId(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    const supabase = createClient();
    if (supabase) await supabase.from("project_tasks").update({ status }).eq("id", id);
    setSavingId(null);
  }

  const targetName = profiles.find((p) => p.id === targetId)?.full_name ?? profile?.full_name ?? "there";
  const firstName = targetName.split(" ")[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-6 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[10px] font-medium text-primary-foreground">
            TL
          </div>
          <span className="text-[13px] font-medium text-foreground">Trydent Labs</span>
          <span className="text-[13px] text-muted-foreground">· Staff portal</span>
          {isPreview && (
            <span className="ml-2 inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
              <Eye className="h-3 w-3" /> Preview — what {firstName} sees
            </span>
          )}
        </div>
        {!isPreview && (
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="animate-page mx-auto flex max-w-4xl flex-col gap-6 p-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Your work hub</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Hi, {firstName}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Everything assigned to you, your schedule, and your payment plan — all in one place.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat icon={CheckCircle2} value={String(openTasks.length)} label="Open tasks" />
              <Stat icon={CalendarClock} value={String(dueThisWeek)} label="Due this week" />
              <Stat icon={Wallet} value={formatCurrency(outstanding)} label="Outstanding pay" />
            </div>
          </div>
        </section>

        {/* Tasks */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> My tasks
          </h2>
          {openTasks.length === 0 ? (
            <Card className="rounded-xl shadow-sm">
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing assigned right now.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {BUCKETS.map((bucket) => {
                const items = grouped.get(bucket)!;
                if (items.length === 0) return null;
                return (
                  <div key={bucket}>
                    <h3
                      className={cn(
                        "mb-2 flex items-center gap-2 text-[13px] font-semibold",
                        bucket === "Overdue" ? "text-danger" : "text-foreground-secondary"
                      )}
                    >
                      {bucket}
                      <span className="rounded-full bg-white/5 px-1.5 py-px text-[11px] font-normal text-muted-foreground">
                        {items.length}
                      </span>
                    </h3>
                    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                      {items.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 border-b border-border-subtle px-3.5 py-2.5 last:border-0"
                        >
                          <PriorityFlag priority={t.priority} showNormal />
                          {isPreview ? (
                            <Badge tone={statusToneOf(t.status)} dot>{t.status}</Badge>
                          ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                              <StatusPicker
                                value={t.status}
                                options={TASK_STATUSES}
                                onChange={(status) => updateStatus(t.id, status)}
                              />
                            </div>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                          {savingId === t.id && <span className="text-[11px] text-muted-2">saving…</span>}
                          {t.due_date && (
                            <Badge tone={bucket === "Overdue" ? "red" : "gray"}>{formatDate(t.due_date)}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Schedule */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <CalendarClock className="h-4 w-4 text-muted-foreground" /> My schedule
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            {upcoming.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
            )}
            {upcoming.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-b border-border-subtle px-3.5 py-2.5 text-sm last:border-0">
                <span className="min-w-0 flex-1 truncate">{a.description}</span>
                {a.location && <span className="shrink-0 text-xs text-muted-foreground">{a.location}</span>}
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(a.activity_date)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Payment plan */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" /> My payment plan
          </h2>
          <Card className="rounded-xl shadow-sm">
            <div className="grid grid-cols-3 gap-3 border-b border-border-subtle pb-4 text-sm">
              <div>
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(payTotal)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Paid</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-success">{formatCurrency(payPaid)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Outstanding</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-warning">{formatCurrency(outstanding)}</p>
              </div>
            </div>
            <div className="flex flex-col divide-y divide-border-subtle">
              {payments.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No payment plan set up yet — your account manager will add it.
                </p>
              )}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Badge tone={p.status === "paid" ? "green" : "yellow"}>{p.status === "paid" ? "Paid" : "Pending"}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.label}</p>
                    {p.due_date && <p className="text-xs text-muted-foreground">Due {formatDate(p.due_date)}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums">{formatCurrency(Number(p.amount))}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}

/** Local tone mapping so the preview status badge matches the picker's colors. */
function statusToneOf(status: string): "green" | "blue" | "yellow" | "gray" {
  if (status === "Done") return "green";
  if (status === "In Progress") return "blue";
  if (status === "Archived") return "gray";
  return "yellow";
}

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
