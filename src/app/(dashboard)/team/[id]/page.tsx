"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Settings2,
  UserX,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { BarRow } from "@/components/ui/BarRow";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import { useTeamDashboard, type MemberLoad } from "@/lib/useTeamDashboard";
import { useAuth } from "@/lib/useAuth";
import { isAdmin as hasAdminRights } from "@/lib/permissions";
import { seriesFill } from "@/lib/chartSeries";
import { formatDate } from "@/lib/format";
import { staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { ProjectTask } from "@/lib/types";

export default function TeamDashboardPage() {
  return (
    <RequireAccess page="team">
      <TeamDashboardInner />
    </RequireAccess>
  );
}

function TeamDashboardInner() {
  const params = useParams<{ id: string }>();
  const { access } = useAuth();
  const d = useTeamDashboard(params.id);

  if (d.loading) return <TableSkeleton rows={6} />;
  if (!d.team) {
    return (
      <EmptyState
        icon={UserX}
        title="Team not found"
        description="It may have been renamed or deleted. Check Settings › Teams."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div>
        {/* No back link. This is a destination reached from the sidebar tree,
            not a drill-down from a list — "back" implied a stack that doesn't
            exist, and the tabs already handle returning anywhere. */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{d.team.name}</h2>
          <div className="flex items-center -space-x-1.5">
            {d.members.slice(0, 6).map((m) => (
              <Avatar key={m.id} name={m.full_name} size="sm" />
            ))}
            {d.members.length > 6 && (
              <span className="ml-2.5 text-[11.5px] text-muted-2">
                +{d.members.length - 6}
              </span>
            )}
          </div>
          {hasAdminRights(access) && (
            <Link
              href={`/settings/teams/${d.team.id}`}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" /> Manage team
            </Link>
          )}
        </div>
      </div>

      {d.kind === "empty" ? (
        <EmptyState
          icon={Users}
          title="Nobody on this team yet"
          description="Assign someone a role on this team and their work shows up here."
        />
      ) : d.kind === "delivery" ? (
        <DeliveryView d={d} />
      ) : (
        <BusinessView d={d} />
      )}
    </div>
  );
}

type Dash = ReturnType<typeof useTeamDashboard>;

/* ── Delivery ───────────────────────────────────────────────────────────── */

function DeliveryView({ d }: { d: Dash }) {
  const doneThisWeek = d.throughput[d.throughput.length - 1]?.done ?? 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:transition-[border-color,background-color,translate] [&>*]:duration-150 [&>*:hover]:-translate-y-px [&>*:hover]:border-edge">
        <StatCard label="Open tasks" value={String(d.openTasks.length)} icon={ClipboardList} />
        <StatCard label="Overdue" value={String(d.overdue.length)} icon={AlertTriangle} />
        <StatCard label="Due this week" value={String(d.dueThisWeek.length)} icon={CalendarDays} />
        <StatCard label="Done this week" value={String(doneThisWeek)} icon={CheckCircle2} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkloadCard workload={d.workload} />
        <NeedsAttentionCard
          overdue={d.overdue}
          dueSoon={d.dueThisWeek}
          projectName={(id) => d.projects.find((p) => p.id === id)?.name ?? "Project"}
        />
      </div>

      {/* Back to the default stretch. items-start killed the dead space by
          shrinking the card, which left a hole in the row instead. The chart
          now fills whatever height the row gives it (see ThroughputCard), so
          both cards end level and neither is padded out. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectsCard d={d} />
        <ThroughputCard data={d.throughput} />
      </div>

      {d.awaitingApproval.length > 0 && <AwaitingApprovalCard d={d} />}
    </>
  );
}

/**
 * The reason this page exists.
 *
 * Sorted heaviest first with overdue breaking ties, because two people on
 * eight tasks each are not equally stuck. The bar is scaled against the
 * busiest person rather than an absolute ceiling — there's no such thing as a
 * "full" workload here, and the useful comparison is relative.
 */
function WorkloadCard({ workload }: { workload: MemberLoad[] }) {
  const busiest = Math.max(1, ...workload.map((w) => w.open));

  return (
    <Card>
      <h3 className="text-sm font-semibold">Workload</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Open tasks per person, busiest first.
      </p>
      <div className="mt-3.5 flex flex-col gap-1.5">
        {workload.map((w, i) => (
          <div
            key={w.profile.id}
            style={staggerDelay(i)}
            className="animate-row -mx-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-fill"
          >
            <BarRow
              label={w.profile.full_name}
              value={String(w.open)}
              pct={(w.open / busiest) * 100}
              tone={w.overdue > 0 ? "danger" : w.open === 0 ? "primary" : "primary"}
              leading={<Avatar name={w.profile.full_name} size="xs" />}
            />
            {(w.overdue > 0 || w.dueSoon > 0) && (
              <p className="mt-0.5 pl-7 text-[11px] text-muted-2">
                {w.overdue > 0 && (
                  <span className="text-[var(--danger-fg)]">{w.overdue} overdue</span>
                )}
                {w.overdue > 0 && w.dueSoon > 0 && " · "}
                {w.dueSoon > 0 && `${w.dueSoon} due this week`}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Overdue and due-soon in one list, because they're the same decision. */
function NeedsAttentionCard({
  overdue,
  dueSoon,
  projectName,
}: {
  overdue: ProjectTask[];
  dueSoon: ProjectTask[];
  projectName: (id: string) => string;
}) {
  const rows = [...overdue, ...dueSoon].slice(0, 10);

  return (
    <Card>
      <h3 className="text-sm font-semibold">Needs attention</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Overdue first, then anything due in the next seven days.
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing late and nothing due this week.
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {rows.map((t, i) => {
            const late = overdue.includes(t);
            return (
              <Link
                key={t.id}
                href={`/projects/${t.project_id}`}
                style={staggerDelay(i)}
                className="animate-row flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{t.name}</span>
                  <span className="block truncate text-[11px] text-muted-2">
                    {projectName(t.project_id)}
                  </span>
                </span>
                <Badge tone={late ? "red" : "yellow"}>
                  {t.due_date ? formatDate(t.due_date) : "No date"}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ProjectsCard({ d }: { d: Dash }) {
  const rows = d.teamProjects.map((p) => {
    const tasks = d.allTasks.filter((t) => t.project_id === p.id);
    const done = tasks.filter((t) => t.status === "Done").length;
    return { project: p, done, total: tasks.length };
  });

  return (
    <Card>
      <h3 className="text-sm font-semibold">Active projects</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Anything someone on this team owns or is working on.
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No active projects.
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {rows.map(({ project, done, total }, i) => (
            <Link key={project.id} href={`/projects/${project.id}`} style={staggerDelay(i)}>
              <BarRow
                className="animate-row"
                label={project.name}
                value={total > 0 ? `${done}/${total}` : "—"}
                pct={total > 0 ? (done / total) * 100 : 0}
                tone={total > 0 && done === total ? "success" : "primary"}
                leading={<FolderKanban className="h-3.5 w-3.5 text-muted-2" />}
              />
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

const throughputTooltip = ({ point }: { point: Record<string, unknown> }) => {
  const done = Number(point.done);
  return (
    <TooltipContent
      title={`Week of ${String(point.week)}`}
      rows={[
        {
          color: "var(--chart-1)",
          label: done === 1 ? "task completed" : "tasks completed",
          value: done,
        },
      ]}
    />
  );
};

function ThroughputCard({ data }: { data: { week: string; done: number }[] }) {
  const total = data.reduce((sum, w) => sum + w.done, 0);

  return (
    <Card className="flex flex-col">
      <h3 className="text-sm font-semibold">Throughput</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Tasks completed per week, last eight. {total} in total.
      </p>
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing completed in the last eight weeks.
        </p>
      ) : (
        /*
         * flex-1 plus h-full on the chart, rather than an aspect ratio.
         * An aspect ratio fixes the height to the width, so on a wide screen
         * the card grew a gap under the bars and on a narrow one the bars
         * squashed. Letting the chart take the row's height means it's the
         * bars that get taller, which is also the more readable outcome —
         * a taller plot separates a 1 from a 5 better than a wider one does.
         * min-h stops it collapsing when the row happens to be short.
         */
        <div className="mt-2 flex min-h-[260px] flex-1 flex-col">
          <BarChart
            className="h-full flex-1"
            data={data}
            xDataKey="week"
            barGap={0.3}
            barWidth={22}
            margin={{ top: 20, right: 8, bottom: 34, left: 8 }}
          >
            <Grid horizontal fadeHorizontal vertical={false} />
            {/* fadedOpacity is what makes hovering mean something: the other
                bars recede so the one under the cursor reads clearly. */}
            <Bar dataKey="done" fill={seriesFill(0)} lineCap="round" fadedOpacity={0.25} />
            <BarXAxis />
            {/* This was simply missing. fadedOpacity dimmed the other bars on
                hover, which made the chart feel interactive while telling you
                nothing — the number you were hovering for never appeared. */}
            <ChartTooltip content={throughputTooltip} />
          </BarChart>
        </div>
      )}
    </Card>
  );
}

/** Finished work sitting on a client's desk. Age is the interesting part. */
function AwaitingApprovalCard({ d }: { d: Dash }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold">
        Awaiting client approval
        <span className="ml-1.5 text-xs font-normal text-muted-2">
          {d.awaitingApproval.length}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Delivered and waiting on a sign-off. Oldest first — these are the ones to chase.
      </p>
      <div className="mt-3.5 flex flex-col gap-1.5">
        {d.awaitingApproval.slice(0, 8).map(({ task: t, days }, i) => {
          return (
            <Link
              key={t.id}
              href={`/projects/${t.project_id}`}
              style={staggerDelay(i)}
              className="animate-row flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{t.name}</span>
              <span className="truncate text-[11px] text-muted-2">
                {d.projects.find((p) => p.id === t.project_id)?.name}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11.5px]",
                  days >= 7 ? "text-[var(--warning-fg)]" : "text-muted-2"
                )}
              >
                {days === 0 ? "today" : `${days}d`}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Business ───────────────────────────────────────────────────────────── */

function BusinessView({ d }: { d: Dash }) {
  return (
    <>
      <BusinessStats d={d} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GoalsCard d={d} />
        <QuietClientsCard d={d} />
      </div>
      <MeetingsCard d={d} />
    </>
  );
}

function BusinessStats({ d }: { d: Dash }) {
  const open = d.teamDeals.filter(
    (x) => x.deal_stage !== "Closed Won" && x.deal_stage !== "Closed Lost"
  );
  const won = d.teamDeals.filter((x) => x.deal_stage === "Closed Won");
  const onTrack = d.teamGoals.filter(
    (g) => g.status === "on_track" || g.status === "achieved"
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Open deals" value={String(open.length)} icon={ClipboardList} />
      <StatCard label="Deals won" value={String(won.length)} icon={CheckCircle2} />
      <StatCard label="Clients owned" value={String(d.teamClients.length)} icon={Users} />
      <StatCard
        label="Goals on track"
        value={d.teamGoals.length ? `${onTrack}/${d.teamGoals.length}` : "—"}
        icon={CalendarDays}
      />
    </div>
  );
}

function GoalsCard({ d }: { d: Dash }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold">Goals</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Owned by someone on this team.</p>
      {d.teamGoals.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No goals owned here yet.
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {d.teamGoals.map((g, i) => {
            const krs = d.keyResults.filter((k) => k.goal_id === g.id);
            const pct =
              krs.length === 0
                ? 0
                : Math.round(
                    (krs.reduce(
                      (sum, k) =>
                        sum + Math.min(1, Number(k.target) ? Number(k.current_manual) / Number(k.target) : 0),
                      0
                    ) /
                      krs.length) *
                      100
                  );
            return (
              <Link key={g.id} href="/goals" style={staggerDelay(i)}>
                <BarRow
                  className="animate-row"
                  label={g.objective}
                  value={`${pct}%`}
                  pct={pct}
                  tone={
                    g.status === "off_track"
                      ? "danger"
                      : g.status === "at_risk"
                        ? "warning"
                        : g.status === "achieved"
                          ? "success"
                          : "primary"
                  }
                />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * Clients this team owns, coldest contact first.
 *
 * Deliberately not "all clients" — a manager's page should show the accounts
 * they're answerable for, and a list of everyone's clients is the Clients page.
 */
function QuietClientsCard({ d }: { d: Dash }) {
  const rows = d.quietClients.slice(0, 8);

  return (
    <Card>
      <h3 className="text-sm font-semibold">Going quiet</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Accounts this team owns, longest since contact first.
      </p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No clients assigned to this team.
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {rows.map(({ client: c, days }, i) => {
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                style={staggerDelay(i)}
                className="animate-row flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{c.company}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11.5px]",
                    days === null || days > 30 ? "text-[var(--warning-fg)]" : "text-muted-2"
                  )}
                >
                  {days === null ? "never" : days === 0 ? "today" : `${days}d ago`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MeetingsCard({ d }: { d: Dash }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold">This week</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Meetings anyone on the team is running or attending.
      </p>
      {d.meetingsThisWeek.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing in the next seven days.
        </p>
      ) : (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {d.meetingsThisWeek.map((a, i) => (
            <Link
              key={a.id}
              href="/schedule"
              style={staggerDelay(i)}
              className="animate-row flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-2" />
              <span className="min-w-0 flex-1 truncate text-[13px]">{a.description}</span>
              <span className="shrink-0 text-[11.5px] text-muted-2">
                {formatDate(a.activity_date)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
