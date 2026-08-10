"use client";

import { useMemo } from "react";
import { ArrowUpRight, ListChecks, Target, UserPlus, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import { cn } from "@/lib/utils";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useAuth } from "@/lib/useAuth";
import { useTabs } from "@/lib/tabs";
import { useCurrency } from "@/lib/currency";
import { canAccess, type PageKey } from "@/lib/permissions";
import { goalPct, type MetricSources } from "@/lib/goals";
import type {
  Applicant,
  Client,
  Deal,
  Goal,
  Invoice,
  KeyResult,
  OnboardingTask,
  Profile,
  ProjectTask,
} from "@/lib/types";
import { APPLICANT_STAGES, APPLICANT_STAGE_LABELS, GOAL_STATUS_LABELS } from "@/lib/types";
import { seriesFill, seriesSwatch } from "@/lib/chartSeries";



/**
 * The organisation hub — one sidebar entry standing in for Goals, Recruiting,
 * Onboarding and Team. Modelled on the "Internal Hub" section of Gokul's old
 * Notion dashboard: a short list of destinations, each carrying enough live
 * numbers to be worth reading on its own.
 *
 * Cards are filtered by role, so a rep sees a smaller hub rather than a wall of
 * locked doors.
 */

interface HubCard {
  page: PageKey;
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  stats: { label: string; value: string }[];
}

export default function OrganizationPage() {
  const { access } = useAuth();
  const { openInNewTab } = useTabs();
  const { toBase, base } = useCurrency();

  const { rows: goals, loading } = useSupabaseTable<Goal>("goals");
  const { rows: keyResults } = useSupabaseTable<KeyResult>("key_results");
  const { rows: applicants } = useSupabaseTable<Applicant>("applicants");
  const { rows: onboarding } = useSupabaseTable<OnboardingTask>("onboarding_tasks");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: tasks } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: invoices } = useSupabaseTable<Invoice>("invoices");

  const src: MetricSources = useMemo(
    () => ({ deals, clients, tasks, invoices, toBase, base }),
    [deals, clients, tasks, invoices, toBase, base]
  );

  const cards = useMemo<HubCard[]>(() => {
    const activeGoals = goals.filter((g) => g.status !== "achieved");
    const avgProgress =
      activeGoals.length === 0
        ? 0
        : Math.round(
            activeGoals.reduce(
              (sum, g) =>
                sum + goalPct(keyResults.filter((k) => k.goal_id === g.id), g, src),
              0
            ) / activeGoals.length
          );

    const inPipeline = applicants.filter(
      (a) => a.stage !== "hired" && a.stage !== "rejected"
    ).length;
    const hired = applicants.filter((a) => a.stage === "hired").length;

    const openOnboarding = onboarding.filter((t) => !t.done).length;
    const peopleOnboarding = new Set(
      onboarding.filter((t) => !t.done).map((t) => t.profile_id)
    ).size;

    const staff = profiles.filter((p) => p.role !== "client");
    const teamCount = new Set(
      staff.map((p) => p.team).filter((t): t is string => !!t)
    ).size;

    return [
      {
        page: "goals",
        href: "/goals",
        label: "Company goals",
        description: "Objectives and key results, measured against live data.",
        icon: Target,
        stats: [
          { label: "Active goals", value: String(activeGoals.length) },
          { label: "Avg progress", value: `${avgProgress}%` },
        ],
      },
      {
        page: "recruiting",
        href: "/recruiting",
        label: "Recruiting",
        description: "Applicant pipeline from first contact to offer.",
        icon: UserPlus,
        stats: [
          { label: "In pipeline", value: String(inPipeline) },
          { label: "Hired", value: String(hired) },
        ],
      },
      {
        page: "onboarding",
        href: "/onboarding",
        label: "Onboarding",
        description: "Checklists for everyone still finding their feet.",
        icon: ListChecks,
        stats: [
          { label: "Open steps", value: String(openOnboarding) },
          { label: "People", value: String(peopleOnboarding) },
        ],
      },
      {
        page: "team",
        href: "/team",
        label: "Team",
        description: "Members, roles, reporting lines and the org chart.",
        icon: UsersRound,
        stats: [
          { label: "Members", value: String(staff.length) },
          { label: "Teams", value: String(teamCount) },
        ],
      },
    ];
  }, [goals, keyResults, applicants, onboarding, profiles, src]);

  const visible = cards.filter((c) => canAccess(access, c.page));

  /** Hiring funnel. Rejected is excluded — it's an outcome, not a stage, and
   *  including it makes the funnel read like a chart of failure. */
  const funnelData = useMemo(
    () =>
      APPLICANT_STAGES.filter((s) => s !== "rejected").map((stage) => ({
        stage: APPLICANT_STAGE_LABELS[stage],
        count: applicants.filter((a) => a.stage === stage).length,
      })),
    [applicants]
  );

  const teamSplit = useMemo(() => {
    const staff = profiles.filter((p) => p.role !== "client");
    const counts = new Map<string, number>();
    for (const p of staff) {
      const key = p.team?.trim() || "Unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label,
        value,
        color: seriesSwatch(i),
      }));
  }, [profiles]);

  const goalProgress = useMemo(
    () =>
      goals
        .filter((g) => g.status !== "achieved")
        .map((g) => ({
          goal: g,
          pct: goalPct(keyResults.filter((k) => k.goal_id === g.id), g, src),
        })),
    [goals, keyResults, src]
  );

  const onboardingSplit = useMemo(() => {
    const done = onboarding.filter((t) => t.done).length;
    const open = onboarding.length - done;
    return [
      { label: "Done", value: done, color: "var(--success)" },
      { label: "Open", value: open, color: "var(--primary)" },
    ].filter((d) => d.value > 0);
  }, [onboarding]);

  const funnelTooltip = ({ point }: { point: Record<string, unknown> }) => (
    <TooltipContent
      title={String(point.stage)}
      rows={[
        { color: "var(--chart-1)", label: "Applicants", value: Number(point.count) },
      ]}
    />
  );

  const showGoals = canAccess(access, "goals");
  const showRecruiting = canAccess(access, "recruiting");
  const showTeam = canAccess(access, "team");
  const showOnboarding = canAccess(access, "onboarding");

  if (loading) return <TableSkeleton rows={4} />;

  return (
    // No max-width here on purpose: this is a dashboard, not a reading page, so
    // it should use whatever room the screen gives it.
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      {/* No page title here — the topbar already says "Organisation", and
          printing it twice, six lines apart, is just noise. The subtitle
          survives because it says something the topbar doesn't. */}
      <p className="text-sm text-muted-foreground">
        How the company runs: goals, hiring, onboarding and the team itself.
      </p>

      {/* ============ VISUALISATIONS ============ */}
      {/*
        Goal progress gets its own full-width band rather than sharing a row
        with the charts. It's a short list of bars, so pairing it with tall
        donuts stretched it into a mostly-empty card AND pushed the third chart
        onto a lonely row of its own.
      */}
      {showGoals && (
        <Card className="rounded-xl shadow-[var(--shadow-sm)]">
          <h3 className="text-sm font-semibold">Goal progress</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Active objectives, rolled up from their key results.
          </p>
          {goalProgress.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active goals.
            </p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-3">
              {goalProgress.map(({ goal, pct }) => (
                <div key={goal.id}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{goal.objective}</span>
                    <span className="shrink-0 text-[11px] text-muted-2">
                      {GOAL_STATUS_LABELS[goal.status]}
                    </span>
                    <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-active">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out)]",
                        pct >= 100 ? "bg-success" : "bg-primary"
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* The three charts share one row so none of them ends up orphaned. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {showRecruiting && (
          <Card className="flex flex-col rounded-xl shadow-[var(--shadow-sm)]">
            <h3 className="text-sm font-semibold">Hiring funnel</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Where applicants sit right now. Rejected is excluded.
            </p>
            {applicants.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
                No applicants yet.
              </p>
            ) : (
              <div className="mt-3">
                <BarChart
                  data={funnelData}
                  xDataKey="stage"
                  aspectRatio="5 / 3"
                  barGap={0.3}
                  // Fixed, not auto — see the note on the dashboard chart.
                  barWidth={26}
                  margin={{ top: 20, right: 8, bottom: 34, left: 8 }}
                >
                  <Grid horizontal fadeHorizontal vertical={false} />
                  <Bar dataKey="count" fill={seriesFill(0)} lineCap="round" />
                  <BarXAxis />
                  <ChartTooltip content={funnelTooltip} />
                </BarChart>
              </div>
            )}
          </Card>
        )}

        {showTeam && (
          <Card className="flex flex-col rounded-xl shadow-[var(--shadow-sm)]">
            <h3 className="text-sm font-semibold">Team composition</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Headcount split across teams.
            </p>
            {teamSplit.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
                No team members yet.
              </p>
            ) : (
              <>
                <div className="flex flex-1 items-center justify-center py-3">
                  <PieChart
                    data={teamSplit}
                    size={180}
                    innerRadius={52}
                    padAngle={0.05}
                    cornerRadius={6}
                  >
                    {teamSplit.map((s, i) => (
                      <PieSlice key={s.label} index={i} />
                    ))}
                    <PieCenter defaultLabel="people" />
                  </PieChart>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {teamSplit.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        )}

        {showOnboarding && (
          <Card className="flex flex-col rounded-xl shadow-[var(--shadow-sm)]">
            <h3 className="text-sm font-semibold">Onboarding</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Checklist steps across everyone still in progress.
            </p>
            {onboardingSplit.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
                No checklists running.
              </p>
            ) : (
            <div className="flex flex-1 items-center justify-center py-3">
              <PieChart
                data={onboardingSplit}
                size={180}
                innerRadius={52}
                padAngle={0.05}
                cornerRadius={6}
              >
                {onboardingSplit.map((s, i) => (
                  <PieSlice key={s.label} index={i} />
                ))}
                <PieCenter defaultLabel="steps" />
              </PieChart>
            </div>
            )}
            {onboardingSplit.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {onboardingSplit.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((card) => (
          <button
            key={card.label}
            onClick={() => openInNewTab(card.href, card.label)}
            className="group rounded-xl border border-border bg-surface p-4 text-left lift shadow-[var(--shadow-sm)] hover:border-primary/30 hover:bg-surface-fill"
          >
            <div className="flex items-center gap-2">
              <card.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{card.label}</span>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{card.description}</p>
            <div className="mt-3.5 flex gap-6 border-t border-border-subtle pt-3">
              {card.stats.map((s) => (
                <div key={s.label}>
                  <p className="text-lg font-semibold tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <Card className="rounded-xl shadow-[var(--shadow-sm)]">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing here for your role yet.
          </p>
        </Card>
      )}
    </div>
  );
}
