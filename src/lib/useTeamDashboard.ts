"use client";

import { useMemo } from "react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import type {
  Activity,
  Client,
  Deal,
  Goal,
  KeyResult,
  Profile,
  Project,
  ProjectTask,
  Team,
} from "@/lib/types";

/**
 * Everything a team dashboard needs, derived from what already exists.
 *
 * Nothing in the schema knows about teams and work at the same time. Tasks
 * carry an assignee, projects carry members, and `profiles.team` is the only
 * link between a person and a team — so a team's work is "everything belonging
 * to anyone on it". That's enough for workload, lateness and throughput
 * without adding a `team_id` to three more tables.
 *
 * The cost of deriving rather than storing: someone who moves teams takes
 * their history with them, so last month's throughput changes retroactively.
 * For a page about *current* load that's the right trade — you want to know
 * who is busy now, not who was busy under a previous org chart.
 */

export type TeamKind = "delivery" | "business" | "empty";

const DAY = 24 * 60 * 60 * 1000;

export interface MemberLoad {
  profile: Profile;
  open: number;
  overdue: number;
  dueSoon: number;
}

export function useTeamDashboard(teamId: string) {
  const { rows: teams, loading: teamsLoading } = useSupabaseTable<Team>("teams");
  const { rows: staff, loading: staffLoading } = useStaffProfiles();
  const { rows: tasks, loading: tasksLoading } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: projects } = useSupabaseTable<Project>("projects");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: goals } = useSupabaseTable<Goal>("goals");
  const { rows: keyResults } = useSupabaseTable<KeyResult>("key_results");
  const { rows: activities } = useSupabaseTable<Activity>("activities");

  const team = teams.find((t) => t.id === teamId) ?? null;
  const teamName = team?.name ?? null;

  const members = useMemo(
    () => (teamName ? staff.filter((p) => p.team === teamName) : []),
    [staff, teamName]
  );

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  /** Open = not Done and not Archived. Archived is deliberately excluded from
   *  load: it's work someone decided not to do, and counting it makes a tidy
   *  backlog look like a crisis. */
  const teamTasks = useMemo(
    () => tasks.filter((t) => t.assigned_to && memberIds.has(t.assigned_to)),
    [tasks, memberIds]
  );

  const openTasks = useMemo(
    () => teamTasks.filter((t) => t.status !== "Done" && t.status !== "Archived"),
    [teamTasks]
  );

  const { overdue, dueThisWeek } = useMemo(() => {
    const today = startOfToday();
    const weekEnd = today + 7 * DAY;
    const late: ProjectTask[] = [];
    const soon: ProjectTask[] = [];
    for (const t of openTasks) {
      if (!t.due_date) continue;
      const due = new Date(t.due_date).setHours(0, 0, 0, 0);
      if (due < today) late.push(t);
      else if (due <= weekEnd) soon.push(t);
    }
    const byDate = (a: ProjectTask, b: ProjectTask) =>
      (a.due_date ?? "").localeCompare(b.due_date ?? "");
    return { overdue: late.sort(byDate), dueThisWeek: soon.sort(byDate) };
  }, [openTasks]);

  /** Heaviest first — the whole point of the card is spotting the outlier. */
  const workload = useMemo<MemberLoad[]>(() => {
    const today = startOfToday();
    const weekEnd = today + 7 * DAY;
    return members
      .map((profile) => {
        const mine = openTasks.filter((t) => t.assigned_to === profile.id);
        let late = 0;
        let soon = 0;
        for (const t of mine) {
          if (!t.due_date) continue;
          const due = new Date(t.due_date).setHours(0, 0, 0, 0);
          if (due < today) late++;
          else if (due <= weekEnd) soon++;
        }
        return { profile, open: mine.length, overdue: late, dueSoon: soon };
      })
      // Overdue breaks ties: two people on eight tasks are not equally stuck.
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  }, [members, openTasks]);

  /** Projects the team touches — by membership, ownership or an assigned task. */
  const teamProjects = useMemo(() => {
    const viaTask = new Set(teamTasks.map((t) => t.project_id));
    return projects.filter(
      (p) =>
        !p.archived &&
        (viaTask.has(p.id) ||
          (p.owner && memberIds.has(p.owner)) ||
          (p.member_ids ?? []).some((id) => memberIds.has(id)))
    );
  }, [projects, teamTasks, memberIds]);

  /**
   * Finished, handed over, and still waiting on a signature.
   *
   * The age is computed here rather than in the card because `Date.now()` in a
   * render body is impure — the same props would produce different output on a
   * re-render, which is exactly what react-hooks/purity exists to catch.
   */
  const awaitingApproval = useMemo(
    () =>
      teamTasks
        .filter((t) => t.status === "Done" && !t.approved_at)
        .sort((a, b) => (a.updated_at ?? "").localeCompare(b.updated_at ?? ""))
        .map((task) => ({
          task,
          days: daysSince(task.updated_at ?? task.created_at),
        })),
    [teamTasks]
  );

  /**
   * Tasks completed per week for the last 8 weeks.
   *
   * Uses `updated_at` because there's no `completed_at` — an approximation
   * that's right for a task moved to Done and then left alone, and wrong for
   * one edited afterwards. Good enough for a trend line, not for a payroll
   * calculation, and worth replacing with a real timestamp if this card
   * becomes something anyone argues about.
   */
  const throughput = useMemo(() => {
    const weeks: { week: string; done: number }[] = [];
    const now = startOfToday();
    for (let i = 7; i >= 0; i--) {
      const start = now - i * 7 * DAY;
      const end = start + 7 * DAY;
      const done = teamTasks.filter((t) => {
        if (t.status !== "Done") return false;
        const at = new Date(t.updated_at ?? t.created_at).getTime();
        return at >= start && at < end;
      }).length;
      weeks.push({
        week: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        done,
      });
    }
    return weeks;
  }, [teamTasks]);

  // ── Business side ────────────────────────────────────────────────────────

  const teamDeals = useMemo(
    () => deals.filter((d) => d.account_owner && memberIds.has(d.account_owner)),
    [deals, memberIds]
  );

  const teamClients = useMemo(
    () => clients.filter((c) => c.account_owner && memberIds.has(c.account_owner)),
    [clients, memberIds]
  );

  /** Coldest contact first. Age computed here for the same purity reason. */
  const quietClients = useMemo(
    () =>
      teamClients
        .filter((c) => c.status !== "Inactive Customer")
        .sort((a, b) => (a.last_contact ?? "").localeCompare(b.last_contact ?? ""))
        .map((client) => ({
          client,
          days: client.last_contact ? daysSince(client.last_contact) : null,
        })),
    [teamClients]
  );

  const teamGoals = useMemo(
    () => goals.filter((g) => g.owner && memberIds.has(g.owner)),
    [goals, memberIds]
  );

  const meetingsThisWeek = useMemo(() => {
    const today = startOfToday();
    const weekEnd = today + 7 * DAY;
    return activities
      .filter((a) => {
        const at = new Date(a.activity_date).getTime();
        if (at < today || at > weekEnd) return false;
        return (
          (a.assigned_to && memberIds.has(a.assigned_to)) ||
          (a.attendee_ids ?? []).some((id) => memberIds.has(id))
        );
      })
      .sort((a, b) => a.activity_date.localeCompare(b.activity_date));
  }, [activities, memberIds]);

  /**
   * Which template to render.
   *
   * Derived from what the team actually does rather than a per-team setting,
   * so it stays right when someone is moved or a team is renamed, and there's
   * no config to forget. A team doing delivery work gets the delivery page
   * even if it also owns deals; a team with no assigned tasks at all gets the
   * business page.
   */
  const kind: TeamKind = useMemo(() => {
    if (members.length === 0) return "empty";
    if (teamTasks.length > 0) return "delivery";
    return "business";
  }, [members.length, teamTasks.length]);

  return {
    loading: teamsLoading || staffLoading || tasksLoading,
    team,
    teamName,
    members,
    kind,
    // delivery
    openTasks,
    overdue,
    dueThisWeek,
    workload,
    teamProjects,
    awaitingApproval,
    throughput,
    allTasks: teamTasks,
    // business
    teamDeals,
    teamClients,
    quietClients,
    teamGoals,
    keyResults,
    meetingsThisWeek,
    // lookups
    projects,
    clients,
  };
}

function startOfToday(): number {
  return new Date().setHours(0, 0, 0, 0);
}

/**
 * Whole days elapsed, measured midnight to midnight.
 *
 * Not `(Date.now() - then) / DAY`. That answers "how many 24-hour periods",
 * which means something finished at 23:00 last night still reads "0d" until
 * 23:00 tonight. Counting calendar days is what someone means when they ask
 * how long a thing has been sitting.
 */
function daysSince(iso: string): number {
  const then = new Date(iso).setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((startOfToday() - then) / DAY));
}
