"use client";

import { useMemo, useState } from "react";
import { Plus, Target } from "lucide-react";
import { toast } from "@/components/Toaster";
import { reportError } from "@/lib/reportError";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { GoalRow } from "@/components/goals/GoalRow";
import { GoalComposer, type DraftGoal } from "@/components/goals/GoalComposer";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { useCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import {
  currentValue,
  goalPct,
  isMoneySource,
  type MetricSources,
} from "@/lib/goals";
import { formatCount } from "@/lib/goalPeriods";
import {
  daysRemaining,
  isStalled,
  paceOf,
  runRate,
  shouldOfferRollover,
  type Pace,
} from "@/lib/goalPace";
import {
  nextQuarter,
  parsePeriod,
  periodBounds,
  periodLabel,
} from "@/lib/goalPeriod";
import type {
  Client,
  Deal,
  Goal,
  Invoice,
  KeyResult,
  Profile,
  ProjectTask,
} from "@/lib/types";

/**
 * Company goals.
 *
 * ── What changed, and why it was a rebuild rather than a tidy-up ────────────
 *
 * The old page was a CRUD list: three cards, each ~230px tall, each showing a
 * percentage and a status someone had picked from a dropdown. It could tell
 * you a goal was at 13%. It could not tell you whether 13% was fine, and the
 * status sitting next to that number said "On track" because it had said "On
 * track" since July.
 *
 * Everything here answers the pace question instead. See lib/goalPace.ts for
 * the maths and its stated limitation, lib/goalPeriod.ts for why dates are
 * derived rather than typed, and lib/goalSentence.ts for why the objective
 * writes itself.
 *
 * The two-level OKR model stays in the schema and is hidden in the UI: every
 * goal created here gets exactly one measure. Nothing migrates, the split is
 * still there if a goal ever genuinely needs two measures, and in the
 * meantime nobody fills in two name fields for one idea.
 */

export default function GoalsPage() {
  return (
    <RequireAccess page="goals">
      <GoalsInner />
    </RequireAccess>
  );
}

function GoalsInner() {
  const { profile } = useAuth();
  const { format: formatCurrency, toBase, base } = useCurrency();

  const { rows: goals, setRows: setGoals, loading } = useSupabaseTable<Goal>("goals", {
    column: "sort_order",
    ascending: true,
  });
  const { rows: keyResults, setRows: setKeyResults } = useSupabaseTable<KeyResult>(
    "key_results",
    { column: "sort_order", ascending: true }
  );
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: tasks } = useSupabaseTable<ProjectTask>("project_tasks");
  const { rows: invoices } = useSupabaseTable<Invoice>("invoices");
  const { rows: profiles } = useSupabaseTable<Profile>("profiles");

  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /*
    Frozen at mount. Reading Date.now() during render makes every goal's pace
    a moving target between renders, and the tick would drift a pixel on each
    keystroke in an unrelated input. A page open across midnight showing
    yesterday's pace is the cheaper wrong.
  */
  const [now] = useState(() => Date.now());

  const src: MetricSources = useMemo(
    () => ({ deals, clients, tasks, invoices, toBase, base }),
    [deals, clients, tasks, invoices, toBase, base]
  );

  const krsByGoal = useMemo(() => {
    const map = new Map<string, KeyResult[]>();
    for (const kr of keyResults) {
      const list = map.get(kr.goal_id);
      if (list) list.push(kr);
      else map.set(kr.goal_id, [kr]);
    }
    return map;
  }, [keyResults]);

  const ownerName = (id: string | null) =>
    profiles.find((p) => p.id === id)?.full_name ?? null;

  /**
   * Everything the row needs, computed once.
   *
   * Bounds come from the PERIOD when it parses, falling back to the stored
   * dates. That ordering is the fix for the drift already in the data: a goal
   * labelled "2027 Q4" with dates spanning seventeen months should be read as
   * the quarter it claims to be, and the reconciliation migration then makes
   * the columns agree.
   */
  const rows = useMemo(() => {
    return goals.map((goal) => {
      const krs = krsByGoal.get(goal.id) ?? [];
      const pct = goalPct(krs, goal, src);
      const choice = parsePeriod(goal.period);
      const bounds = choice
        ? periodBounds(choice)
        : { start: goal.start_date, end: goal.end_date };

      const pace = paceOf(pct, bounds.start, bounds.end, now);
      const primary = krs[0] ?? null;
      const days = daysRemaining(bounds.end, now);

      const current = primary ? currentValue(primary, goal, src) : 0;
      const rate = primary ? runRate(current, Number(primary.target), days) : null;
      const money = primary ? isMoneySource(primary.source) : false;
      const fmt = (v: number) =>
        money ? formatCurrency(v) : `${formatCount(v)}${primary?.unit ? ` ${primary.unit}` : ""}`;

      /*
        Run rates round UP to a whole unit for anything that isn't money.
        Straight division produced "0.71/week needed" for five team-building
        sessions across seven weeks — you cannot hold 0.71 of a session, and
        rounding down would understate what it takes. Money keeps whole units
        too: "8,332.92 a week" is a spurious precision nobody acts on.
      */
      const fmtRate = (v: number) => fmt(money ? Math.round(v) : Math.ceil(v));

      return {
        goal,
        krs,
        primary,
        pct,
        pace,
        choice,
        days,
        stalled: primary ? isStalled(primary.source, primary.updated_at, now) : false,
        action: actionLine(pace, rate, fmtRate),
        detail: detailLine(pace, primary ? current : 0, primary ? Number(primary.target) : 0, days, fmt),
      };
    });
  }, [goals, krsByGoal, src, now, formatCurrency]);

  /** Newest period first; undated last. Same ordering rule as the headings. */
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.goal.period?.trim() || "No period set";
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map, ([period, items]) => ({ period, items })).sort((a, b) => {
      if (a.period === "No period set") return 1;
      if (b.period === "No period set") return -1;
      return b.period.localeCompare(a.period);
    });
  }, [rows]);

  async function createGoal(draft: DraftGoal) {
    setSaving(true);
    const supabase = createClient();
    if (!supabase) {
      setSaving(false);
      return;
    }

    const { data: goal, error } = await supabase
      .from("goals")
      .insert({
        objective: draft.objective,
        period: draft.period,
        start_date: draft.start_date,
        end_date: draft.end_date,
        owner: profile?.id ?? null,
        sort_order: goals.length,
      })
      .select()
      .single();

    if (error || !goal) {
      setSaving(false);
      reportError("create the goal", error);
      return;
    }

    // The measure is part of creating a goal, not a second step. If it fails
    // the goal is left unmeasurable, so the row is rolled back rather than
    // leaving something that renders as 0% forever.
    const { data: kr, error: krError } = await supabase
      .from("key_results")
      .insert({
        goal_id: goal.id,
        name: draft.measureName,
        source: draft.source,
        target: draft.target,
        unit: draft.unit,
        sort_order: 0,
      })
      .select()
      .single();

    setSaving(false);

    if (krError || !kr) {
      await supabase.from("goals").delete().eq("id", goal.id);
      reportError("create the goal", krError);
      return;
    }

    setGoals((prev) => [...prev, goal as Goal]);
    setKeyResults((prev) => [...prev, kr as KeyResult]);
    setComposerOpen(false);
    toast.success("Goal created");
  }

  async function updateMeasure(id: string, patch: Partial<KeyResult>) {
    const before = keyResults;
    setKeyResults((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("key_results").update(patch).eq("id", id);
    if (error) {
      setKeyResults(before);
      reportError("save", error);
    }
  }

  async function deleteGoal(goal: Goal) {
    const ok = await confirmAction({
      title: `Delete "${goal.objective}"?`,
      body: "Its measure goes with it. This can't be undone.",
      confirmLabel: "Delete goal",
    });
    if (!ok) return;

    const beforeGoals = goals;
    const beforeKrs = keyResults;
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    setKeyResults((prev) => prev.filter((k) => k.goal_id !== goal.id));

    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) {
      setGoals(beforeGoals);
      setKeyResults(beforeKrs);
      reportError("delete", error);
    }
  }

  /** Move a missed goal into the next quarter rather than stranding it. */
  async function rollOver(goal: Goal) {
    const choice = parsePeriod(goal.period);
    if (!choice || choice.kind !== "quarter") return;
    const next = nextQuarter(choice);
    const bounds = periodBounds(next);
    const label = periodLabel(next);

    const ok = await confirmAction({
      title: `Move to ${label}?`,
      body: "The target and progress so far carry over. Only the dates change.",
      confirmLabel: `Move to ${label}`,
      tone: "neutral",
    });
    if (!ok) return;

    const patch = { period: label, start_date: bounds.start, end_date: bounds.end };
    const before = goals;
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, ...patch } : g)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("goals").update(patch).eq("id", goal.id);
    if (error) {
      setGoals(before);
      reportError("move the goal", error);
      return;
    }
    toast.success(`Moved to ${label}`);
  }

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Progress against where you should be today.
        </p>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setComposerOpen((o) => !o)}>
            <Plus className="h-3.5 w-3.5" /> New goal
          </Button>
        </div>
      </div>

      {composerOpen && (
        <GoalComposer
          formatCurrency={formatCurrency}
          saving={saving}
          onCancel={() => setComposerOpen(false)}
          onCreate={createGoal}
        />
      )}

      {goals.length === 0 && !composerOpen && (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Set a target and a period. Revenue, clients, tasks and invoices track themselves."
        />
      )}

      {groups.map(({ period, items }) => (
        <section key={period} className="flex flex-col">
          <div className="flex items-center gap-2.5 px-1 pb-1.5">
            {/* A custom range is stored as "2026-08-01 to 2027-12-30" so it
                round-trips through parsePeriod. Raw ISO is a fine key and a
                poor heading, so it's formatted for display only. */}
            <h2 className="text-[13px] font-semibold tracking-tight">
              {headingFor(period)}
            </h2>
            <span className="text-[11px] text-muted-foreground">{summarise(items)}</span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>

          <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-elevated">
            {items.map((row) => (
              <div key={row.goal.id}>
                <GoalRow
                  title={row.goal.objective}
                  pct={row.pct}
                  pace={row.pace}
                  detail={row.detail}
                  action={row.action}
                  stalled={row.stalled}
                  onDelete={() => deleteGoal(row.goal)}
                >
                  {row.primary?.source === "manual" && (
                    <ManualValue
                      key={row.primary.id}
                      value={Number(row.primary.current_manual) || 0}
                      label={`Current value for ${row.goal.objective}`}
                      onCommit={(next) =>
                        updateMeasure(row.primary!.id, { current_manual: next })
                      }
                    />
                  )}
                </GoalRow>

                {shouldOfferRollover(row.pace) && row.choice?.kind === "quarter" && (
                  <div className="flex items-center gap-2 border-t border-border-subtle bg-raise px-4 py-2">
                    <span className="text-[12px] text-muted-foreground">
                      {period} is over and this didn&apos;t land.
                    </span>
                    <button
                      type="button"
                      onClick={() => rollOver(row.goal)}
                      className="rounded-md px-1.5 py-0.5 text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      Move to {periodLabel(nextQuarter(row.choice))}
                    </button>
                  </div>
                )}

                {ownerName(row.goal.owner) && row.krs.length > 1 && (
                  <div className="px-4 pb-2 pl-11 text-[11px] text-muted-2">
                    {row.krs.length} measures · {ownerName(row.goal.owner)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** "₹25,000/week needed" — what to do, rather than how far along you are. */
function actionLine(
  pace: Pace,
  rate: ReturnType<typeof runRate> | null,
  fmt: (v: number) => string
): string | null {
  if (pace.status === "achieved") return "Done";
  if (pace.status === "not_started") return null;
  if (pace.status === "undated") return "No period set — pace can't be worked out";
  if (pace.status === "missed") return "Period closed short of target";
  if (!rate || rate.perWeek === null) return null;
  if (pace.status === "on_track") return `On pace — ${fmt(rate.perWeek)}/week keeps it there`;
  return `${fmt(rate.perWeek)}/week needed to still make it`;
}

function detailLine(
  pace: Pace,
  current: number,
  target: number,
  days: number | null,
  fmt: (v: number) => string
): string {
  const progress = `${fmt(current)} of ${fmt(target)}`;
  if (pace.status === "not_started") {
    return days === null ? progress : `${progress} · not started`;
  }
  if (days === null) return progress;
  if (days === 0) return `${progress} · ended`;
  if (days < 14) return `${progress} · ${days} day${days === 1 ? "" : "s"} left`;
  return `${progress} · ${Math.round(days / 7)} weeks left`;
}

function headingFor(period: string): string {
  const choice = parsePeriod(period);
  if (choice?.kind === "custom") {
    return `${formatDate(choice.start)} to ${formatDate(choice.end)}`;
  }
  return period;
}

function summarise(items: { pct: number; pace: Pace }[]): string {
  const count = `${items.length} goal${items.length === 1 ? "" : "s"}`;
  const dated = items.filter((i) => i.pace.expected !== null);
  if (dated.length === 0) return count;
  const avg = Math.round(items.reduce((s, i) => s + i.pct, 0) / items.length);
  const expected = Math.round(
    (dated.reduce((s, i) => s + (i.pace.expected ?? 0), 0) / dated.length) * 100
  );
  return `${count} · ${avg}% average · ${expected}% expected`;
}

/**
 * A manual measure's current value.
 *
 * Local draft, committed on blur or Enter. Writing on every keystroke turned
 * typing "25000" into five UPDATEs, four of them wrong, and `Number(v) || 0`
 * meant clearing the field wrote a real zero that came straight back — so the
 * only way to edit was select-all-then-type, which nobody discovers.
 */
function ManualValue({
  value,
  label,
  onCommit,
}: {
  value: number;
  label: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const trimmed = draft.trim();
    const next = trimmed === "" ? value : Number(trimmed);
    setDraft(null);
    if (!Number.isFinite(next) || next === value) return;
    onCommit(next);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="h-7 w-24 shrink-0 rounded-md border border-edge bg-transparent px-2 text-right text-xs tabular-nums [appearance:textfield] focus:border-primary/60 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}
