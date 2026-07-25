"use client";

import { useMemo } from "react";
import { ArrowUpRight, ListChecks, Target, UserPlus, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/Skeletons";
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
  const { profile } = useAuth();
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
        page: "recruiting",
        href: "/recruiting",
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

  const visible = cards.filter((c) => canAccess(profile?.role, c.page));

  if (loading) return <TableSkeleton rows={4} />;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Organisation</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How the company runs: goals, hiring, onboarding and the team itself.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((card) => (
          <button
            key={card.label}
            onClick={() => openInNewTab(card.href, card.label)}
            className="group rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-white/[0.04]"
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
        <Card className="rounded-xl shadow-sm">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing here for your role yet.
          </p>
        </Card>
      )}
    </div>
  );
}
