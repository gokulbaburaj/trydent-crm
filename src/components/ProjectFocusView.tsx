"use client";

import { useMemo } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileDown,
  FolderKanban,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  User,
} from "lucide-react";
import {
  QueueDivider,
  QueueHeader,
  QueueItem,
  RecordShell,
  useRecordSelection,
} from "@/components/RecordShell";
import {
  MetaPair,
  PanelGrid,
  PaneTab,
  PanelHeader,
  RecordPane,
  RoundButton,
  StageStepper,
  ToolbarButton,
  type Stage,
} from "@/components/RecordPane";
import { HeatChip, WashCard } from "@/components/ui/Wash";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { AvatarStack } from "@/components/ui/Avatar";
import { Badge, statusTone } from "@/components/ui/Badge";
import { TaskSpanBar } from "@/components/TaskSpanBar";
import { heatOf } from "@/lib/heat";
import {
  PHASE_ORDER,
  currentPhaseIndex,
  isDelivered,
  pausedProgress,
  phaseProgress,
  phaseStepsFor,
  taskCompletion,
} from "@/lib/projectPhase";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Client, Profile, Project, ProjectTask } from "@/lib/types";

/**
 * Projects, as list-detail. Third surface on RecordShell.
 *
 * This is the one that tests whether the panel grid holds up. Clients and
 * Pipeline each fill three thin cards; a project carries a task tree, a
 * budget, a team and a date range, so the grid finally has something dense in
 * it. If the layout was going to fall over, it falls over here.
 *
 * Same rule as the first two: an extra view, nothing removed.
 */

export function ProjectFocusView({
  projects,
  clients,
  tasks,
  profiles,
  onOpenFull,
}: {
  projects: Project[];
  clients: Client[];
  tasks: ProjectTask[];
  profiles: Profile[];
  onOpenFull?: (project: Project) => void;
}) {
  const { selectedId, select, close } = useRecordSelection();

  const clientName = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.company]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Unknown client") : "No client");
  }, [clients]);

  /*
    Tasks bucketed by project once, not filtered per row.

    `tasks` is every task in the workspace — useSupabaseTable fetches whole
    tables — so a `.filter()` inside the row render is O(projects × tasks) on
    every keystroke in the filter box. One pass into a Map instead.
  */
  const tasksByProject = useMemo(() => {
    const m = new Map<string, ProjectTask[]>();
    for (const t of tasks) {
      const list = m.get(t.project_id);
      if (list) list.push(t);
      else m.set(t.project_id, [t]);
    }
    return m;
  }, [tasks]);

  /*
    Sorted by phase before grouping.

    The divider only renders when a row's bucket differs from the one above it,
    which is the right way to group a SORTED list and produces nonsense on an
    unsorted one: the first render showed "In Progress", "Delivered",
    "In Progress", "Delivered" down the column, one heading per row. The list
    arrives in whatever order the table hands back.

    Ordered by PHASE_ORDER rather than alphabetically so the column reads the
    way the work flows. On Hold falls to the end via the -1 → length fallback,
    which is where a paused project belongs in a queue you're working down.
  */
  const ordered = useMemo(() => {
    const rank = (s: Project["status"]) => {
      const i = currentPhaseIndex(s);
      return i === -1 ? PHASE_ORDER.length + 1 : i;
    };
    return [...projects].sort(
      (a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)
    );
  }, [projects]);

  const scored = useMemo(
    () =>
      ordered.map((p) => {
        const own = tasksByProject.get(p.id) ?? [];
        const completion = taskCompletion(own);
        return {
          project: p,
          tasks: own,
          completion,
          /*
            Heat is TASK completion, not phase.

            Phase is already shown by the stepper and the badge; colouring by
            it too would say the same thing three times. Completion is the
            thing you can't see from the status — a project can sit in
            "In Progress" for a month at 10% or at 90%.
          */
          heat: heatOf(completion.fraction * 100),
          bucket: p.status,
        };
      }),
    [ordered, tasksByProject]
  );

  const selected = useMemo(
    () => scored.find((s) => s.project.id === selectedId) ?? null,
    [scored, selectedId]
  );

  return (
    <RecordShell
      hasSelection={!!selected}
      recordKey={selected?.project.id}
      onBack={close}
      list={
        <>
          <QueueHeader title="Projects" count={projects.length} />
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {scored.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={FolderKanban}
                  title="No projects"
                  description="Nothing matches the current filters."
                />
              </div>
            )}

            {scored.map(({ project, completion, heat, bucket }, i) => {
              const newBucket = i === 0 || scored[i - 1].bucket !== bucket;
              return (
                <div key={project.id}>
                  {newBucket && <QueueDivider label={bucket} />}
                  <QueueItem
                    selected={project.id === selectedId}
                    heatBackground={`var(--heat-${heat})`}
                    onClick={() => select(project.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">{project.name}</div>
                        <div className="truncate text-[13px] text-muted-foreground">
                          {clientName(project.client_id)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={statusTone(project.status)}>{project.status}</Badge>
                          {project.due_date && (
                            <span className="truncate text-[11px] text-muted-2">
                              {formatDate(project.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {/* Count, not a percentage. "3/8" says how much work is
                            left; "38%" doesn't, and at this size there's room
                            for the more useful one. */}
                        <div className="text-[13px] font-semibold tabular-nums">
                          {completion.done}/{completion.total}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-2">tasks</div>
                      </div>
                    </div>
                  </QueueItem>
                </div>
              );
            })}
          </div>
        </>
      }
      empty={
        <div className="flex h-full items-center justify-center rounded-[var(--radius)] border border-dashed border-border">
          <EmptyState
            icon={FolderKanban}
            title="Select a project"
            description="Pick one from the list to see its phase, tasks and budget."
          />
        </div>
      }
      detail={
        selected && (
          <ProjectRecord
            project={selected.project}
            tasks={selected.tasks}
            clientName={clientName(selected.project.client_id)}
            profiles={profiles}
            onOpenFull={onOpenFull}
          />
        )
      }
    />
  );
}

function ProjectRecord({
  project,
  tasks,
  clientName,
  profiles,
  onOpenFull,
}: {
  project: Project;
  tasks: ProjectTask[];
  clientName: string;
  profiles: Profile[];
  onOpenFull?: (project: Project) => void;
}) {
  const completion = taskCompletion(tasks);

  /*
    Both calls take `paused_from`.

    Without it a held project renders the old "we don't know where" shape even
    when the column has the answer — and worse, the two calls would disagree:
    phaseStepsFor would emit four steps while currentPhaseIndex pointed at a
    fifth that no longer exists, so nothing would be marked current at all.
  */
  const steps = phaseStepsFor(project.status, project.paused_from);
  const stages: Stage[] = steps.map((s) => ({ id: s.id, label: s.label, tone: s.tone }));
  const currentId =
    stages[currentPhaseIndex(project.status, project.paused_from)]?.id ?? project.status;
  const heldAt = pausedProgress(project.status, project.paused_from);

  const owner = profiles.find((p) => p.id === project.owner);
  const members = profiles.filter((p) => project.member_ids?.includes(p.id));

  /* Sorted by their own order, so the panel matches the project page. */
  const ordered = useMemo(
    () => [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tasks]
  );

  return (
    <RecordPane
      toolbar={
        <>
          <ToolbarButton icon={Save}>Save</ToolbarButton>
          <ToolbarButton icon={Plus}>New task</ToolbarButton>
          <ToolbarButton icon={Trash2}>Delete</ToolbarButton>
          <ToolbarButton icon={RefreshCw}>Refresh</ToolbarButton>
          <ToolbarButton icon={FileDown}>To PDF</ToolbarButton>
          <div className="ml-auto shrink-0">
            <RoundButton title="More">
              <MoreHorizontal className="h-4 w-4" />
            </RoundButton>
          </div>
        </>
      }
      identity={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight">
              {project.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(project.status)}>{project.status}</Badge>
              <span className="inline-flex items-center gap-1 text-[13px] text-foreground-secondary">
                <Building2 className="h-3.5 w-3.5" />
                {clientName}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:ml-auto">
            <MetaPair label="Owner">{owner?.full_name ?? "Unassigned"}</MetaPair>
            <MetaPair label="Budget">
              <Money value={Number(project.budget) || 0} from={project.currency} />
            </MetaPair>
            <MetaPair label="Tasks">
              <span className="inline-flex items-center gap-2">
                {completion.done}/{completion.total}
                <HeatChip
                  step={heatOf(completion.fraction * 100)}
                  label={`${Math.round(completion.fraction * 100)}%`}
                />
              </span>
            </MetaPair>
          </div>
        </div>
      }
      stage={<StageStepper stages={stages} currentId={currentId} />}
      tabs={
        <>
          <PaneTab active>Summary</PaneTab>
          <PaneTab active={false}>Tasks</PaneTab>
          <PaneTab active={false}>Files</PaneTab>
          <PaneTab active={false}>Activity</PaneTab>
        </>
      }
    >
      <PanelGrid>
        {/* Spans two columns: a task list needs width to be scannable, and at
            one third it truncated every name to three words. */}
        <WashCard strong className="lg:col-span-2">
          <PanelHeader
            title="Tasks"
            actions={
              onOpenFull && (
                <RoundButton title="Open full project" onClick={() => onOpenFull(project)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </RoundButton>
              )
            }
          />
          {ordered.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {ordered.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-2.5">
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      t.status === "Done"
                        ? "text-[var(--success-fg)]"
                        : "text-muted-2"
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px]",
                      t.status === "Done" && "text-muted-foreground line-through"
                    )}
                  >
                    {t.name}
                  </span>
                  {/* The multi-day span, finally drawn. See TaskSpanBar. */}
                  <TaskSpanBar task={t} className="shrink-0" />
                </li>
              ))}
              {ordered.length > 8 && (
                <li className="pt-1 text-[12px] text-muted-foreground">
                  and {ordered.length - 8} more
                </li>
              )}
            </ul>
          )}
        </WashCard>

        <WashCard>
          <PanelHeader title="Progress" />
          <div className="flex items-center gap-4">
            <HeatChip
              step={heatOf(completion.fraction * 100)}
              label={`${Math.round(completion.fraction * 100)}%`}
              className="h-14 w-14 rounded-full text-[17px]"
            />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">
                {completion.done} of {completion.total} done
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Archived tasks aren&apos;t counted.
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--wash-line)]">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-[var(--ease-out)]"
              style={{ width: `${completion.fraction * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {/* A paused project reports where it GOT to, not how close it is —
                phaseProgress deliberately returns 0 for held projects because
                it feeds the heat scale. See pausedProgress. */}
            {heldAt !== null
              ? `Paused during ${project.paused_from} — ${Math.round(heldAt * 100)}% of the way through`
              : project.status === "On Hold"
                ? "Paused — phase unknown"
                : `Phase ${Math.round(phaseProgress(project.status) * 100)}%`}
          </p>
        </WashCard>

        <WashCard>
          <PanelHeader title="Team" />
          {members.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nobody assigned.</p>
          ) : (
            <>
              <AvatarStack
                people={members.map((m) => ({
                  id: m.id,
                  full_name: m.full_name,
                  avatar_url: m.avatar_url,
                }))}
                max={6}
              />
              <p className="mt-3 text-[12px] text-muted-foreground">
                {members.length} {members.length === 1 ? "person" : "people"}
                {owner && ` — ${owner.full_name} leads`}
              </p>
            </>
          )}
        </WashCard>

        <WashCard>
          <PanelHeader title="Dates" />
          <ul className="space-y-3">
            <DateRow icon={Plus} label="Starts" value={formatDate(project.start_date)} />
            <DateRow
              icon={CalendarDays}
              label={isDelivered(project.status) ? "Delivered" : "Due"}
              value={formatDate(project.due_date)}
            />
            <DateRow icon={User} label="Created" value={formatDate(project.created_at)} />
          </ul>
        </WashCard>
      </PanelGrid>
    </RecordPane>
  );
}

function DateRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="truncate text-[13px] font-medium">{value}</div>
      </div>
    </li>
  );
}
