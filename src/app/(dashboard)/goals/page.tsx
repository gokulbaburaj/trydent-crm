"use client";

import { useMemo, useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  currentValue,
  goalPct,
  isMoneySource,
  keyResultPct,
  type MetricSources,
} from "@/lib/goals";
import type {
  Client,
  Deal,
  Goal,
  GoalStatus,
  Invoice,
  KeyResult,
  KeyResultSource,
  Profile,
  ProjectTask,
} from "@/lib/types";
import {
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  KEY_RESULT_SOURCES,
  KEY_RESULT_SOURCE_LABELS,
} from "@/lib/types";

const STATUS_TONES: Record<GoalStatus, "green" | "yellow" | "red" | "blue"> = {
  on_track: "blue",
  at_risk: "yellow",
  off_track: "red",
  achieved: "green",
};

/** "2026 Q3" style default so periods group sensibly out of the box. */
function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()} Q${Math.floor(now.getMonth() / 3) + 1}`;
}

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

  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [objective, setObjective] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [krFor, setKrFor] = useState<string | null>(null);
  const [krName, setKrName] = useState("");
  const [krSource, setKrSource] = useState<KeyResultSource>("manual");
  const [krTarget, setKrTarget] = useState("");
  const [krUnit, setKrUnit] = useState("");

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

  const periods = useMemo(() => {
    const set = new Set(goals.map((g) => g.period).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [goals]);

  const [periodFilter, setPeriodFilter] = useState("");
  const visibleGoals = useMemo(
    () => (periodFilter ? goals.filter((g) => g.period === periodFilter) : goals),
    [goals, periodFilter]
  );

  const ownerOf = (id: string | null) => profiles.find((p) => p.id === id) ?? null;

  function formatValue(kr: KeyResult, value: number) {
    if (isMoneySource(kr.source)) return formatCurrency(value);
    const rounded = Math.round(value * 100) / 100;
    return kr.unit ? `${rounded} ${kr.unit}` : String(rounded);
  }

  async function createGoal() {
    const text = objective.trim();
    if (!text) return;
    setSaving(true);
    const supabase = createClient();
    if (!supabase) {
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from("goals")
      .insert({
        objective: text,
        period: period.trim(),
        owner: profile?.id ?? null,
        start_date: startDate,
        end_date: endDate,
        sort_order: goals.length,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(`Couldn't create: ${error?.message ?? "unknown error"}`);
      return;
    }
    setGoals((prev) => [...prev, data as Goal]);
    setObjective("");
    setStartDate(null);
    setEndDate(null);
    setGoalFormOpen(false);
    toast.success("Goal created — add key results to track it");
  }

  async function updateGoal(id: string, patch: Partial<Goal>) {
    const before = goals;
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("goals").update(patch).eq("id", id);
    if (error) {
      setGoals(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteGoal(id: string) {
    const before = goals;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) {
      setGoals(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
  }

  async function addKeyResult(goalId: string) {
    const name = krName.trim();
    const target = Number(krTarget);
    if (!name || Number.isNaN(target)) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("key_results")
      .insert({
        goal_id: goalId,
        name,
        source: krSource,
        target,
        unit: krUnit.trim() || null,
        sort_order: (krsByGoal.get(goalId)?.length ?? 0),
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
      return;
    }
    setKeyResults((prev) => [...prev, data as KeyResult]);
    setKrName("");
    setKrTarget("");
    setKrUnit("");
    setKrSource("manual");
    setKrFor(null);
  }

  async function updateKeyResult(id: string, patch: Partial<KeyResult>) {
    const before = keyResults;
    setKeyResults((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("key_results").update(patch).eq("id", id);
    if (error) {
      setKeyResults(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteKeyResult(id: string) {
    const before = keyResults;
    setKeyResults((prev) => prev.filter((k) => k.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("key_results").delete().eq("id", id);
    if (error) {
      setKeyResults(before);
      toast.error(`Couldn't delete: ${error.message}`);
    }
  }

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Title lives in the topbar; repeating it here just said the same
              word twice on one screen. */}
          <p className="text-sm text-muted-foreground">
            Objectives and key results. Data-backed metrics update themselves.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {periods.length > 0 && (
            <div className="w-36">
              <Dropdown
                value={periodFilter}
                options={[
                  { value: "", label: "All periods" },
                  ...periods.map((p) => ({ value: p, label: p })),
                ]}
                onChange={setPeriodFilter}
              />
            </div>
          )}
          <Button size="sm" onClick={() => setGoalFormOpen((o) => !o)}>
            <Plus className="h-3.5 w-3.5" /> New goal
          </Button>
        </div>
      </div>

      {goalFormOpen && (
        <Card className="rounded-xl shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createGoal();
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <Label>Objective</Label>
              <Textarea
                rows={2}
                placeholder="Double retainer revenue"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Period</Label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div>
                <Label>Starts</Label>
                <DatePicker value={startDate} onChange={setStartDate} placeholder="Start" />
              </div>
              <div>
                <Label>Ends</Label>
                <DatePicker value={endDate} onChange={setEndDate} placeholder="End" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Dates scope the automatic metrics. A goal with no dates counts everything.
            </p>
            <Button type="submit" size="sm" disabled={saving || !objective.trim()}>
              {saving ? "Creating..." : "Create goal"}
            </Button>
          </form>
        </Card>
      )}

      {visibleGoals.length === 0 && (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Set an objective, then attach key results. Revenue, deals, clients, tasks and invoices track themselves."
        />
      )}

      {visibleGoals.map((goal) => {
        const krs = krsByGoal.get(goal.id) ?? [];
        const pct = goalPct(krs, goal, src);
        const owner = ownerOf(goal.owner);
        return (
          <Card key={goal.id} className="rounded-xl shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
              <GoalRing pct={pct} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug">{goal.objective}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {goal.period && <span>{goal.period}</span>}
                  {owner && (
                    <span className="flex items-center gap-1.5">
                      <Avatar name={owner.full_name} url={owner.avatar_url} size="xs" />
                      {owner.full_name}
                    </span>
                  )}
                  <span>
                    {krs.length} key result{krs.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* One control, not a badge next to a dropdown saying the same
                    thing — the badge IS the trigger. */}
                <StatusPicker
                  align="right"
                  value={goal.status}
                  options={GOAL_STATUSES}
                  label="Goal status"
                  renderLabel={(s) => GOAL_STATUS_LABELS[s]}
                  toneFor={(s) => STATUS_TONES[s]}
                  onChange={(status) => updateGoal(goal.id, { status })}
                />
                <button
                  type="button"
                  aria-label="Delete goal"
                  onClick={() => deleteGoal(goal.id)}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-hover hover:text-[var(--danger-fg)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Key results */}
            <div className="mt-4 flex flex-col gap-2.5 border-t border-border-subtle pt-3.5">
              {krs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No key results yet — this goal has nothing to measure.
                </p>
              )}
              {krs.map((kr) => {
                const value = currentValue(kr, goal, src);
                const krPct = keyResultPct(kr, goal, src);
                return (
                  <div key={kr.id} className="group">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="min-w-0 flex-1 truncate">{kr.name}</span>
                      {kr.source === "manual" ? (
                        <input
                          type="number"
                          aria-label={`Current value for ${kr.name}`}
                          value={kr.current_manual}
                          onChange={(e) =>
                            updateKeyResult(kr.id, {
                              current_manual: Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 w-24 rounded-md border border-edge bg-transparent px-2 text-right text-xs tabular-nums focus:border-primary/60 focus:outline-none"
                        />
                      ) : (
                        <span className="tabular-nums text-muted-foreground">
                          {formatValue(kr, value)}
                        </span>
                      )}
                      <span className="text-muted-2">/</span>
                      <span className="tabular-nums text-foreground-secondary">
                        {formatValue(kr, Number(kr.target))}
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
                        {krPct}%
                      </span>
                      <button
                        type="button"
                        aria-label={`Delete ${kr.name}`}
                        onClick={() => deleteKeyResult(kr.id)}
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-[var(--danger-fg)] group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-active">
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out)]",
                            krPct >= 100 ? "bg-success" : "bg-primary"
                          )}
                          style={{ width: `${krPct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-2">
                        {KEY_RESULT_SOURCE_LABELS[kr.source]}
                      </span>
                    </div>
                  </div>
                );
              })}

              {krFor === goal.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addKeyResult(goal.id);
                  }}
                  className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-raise p-2.5"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label>Key result</Label>
                      <Input
                        placeholder="Reach $120k won"
                        value={krName}
                        onChange={(e) => setKrName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Tracked by</Label>
                      <Dropdown
                        value={krSource}
                        options={KEY_RESULT_SOURCES.map((s) => ({
                          value: s,
                          label: KEY_RESULT_SOURCE_LABELS[s],
                        }))}
                        onChange={(v) => setKrSource(v as KeyResultSource)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Target</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="120000"
                        value={krTarget}
                        onChange={(e) => setKrTarget(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Unit (optional)</Label>
                      <Input
                        placeholder="clients"
                        value={krUnit}
                        onChange={(e) => setKrUnit(e.target.value)}
                        disabled={isMoneySource(krSource)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={!krName.trim() || krTarget === ""}>
                      Add key result
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setKrFor(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setKrFor(goal.id)}
                  className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add key result
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function GoalRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = pct >= 100 ? "var(--success)" : "var(--primary)";
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" role="img" aria-label={`${pct}% complete`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${Math.max((pct / 100) * c, 0.01)} ${c}`}
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
      <text
        x="32"
        y="36"
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize="14"
        fontWeight="600"
      >
        {pct}%
      </text>
    </svg>
  );
}
