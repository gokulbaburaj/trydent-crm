"use client";

import { useMemo, useState } from "react";
import { Bolt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  nextQuarter,
  periodBounds,
  periodLabel,
  quarterOf,
  yearOptions,
  type PeriodChoice,
} from "@/lib/goalPeriod";
import { composeObjective, defaultMeasureName } from "@/lib/goalSentence";
import { isMoneySource } from "@/lib/goals";
import { formatDate } from "@/lib/format";
import {
  KEY_RESULT_SOURCES,
  KEY_RESULT_SOURCE_LABELS,
  type KeyResultSource,
} from "@/lib/types";

/**
 * Creating a goal, in one step.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * Two forms. First a goal — objective, period, start date, end date. Then,
 * separately, a key result — name, source, target, unit. Nothing checked one
 * against the other, and in production the result was a goal called "Earn 1
 * Lakhs" whose measure was named "10000" with a target of 200,000.
 *
 * A goal with no measure is unmeasurable and a measure with no goal is
 * orphaned, so they were never independent things — only independent forms.
 *
 * ── The shape ───────────────────────────────────────────────────────────────
 *
 * The source picker drives the rest. Pick a data-backed source and the target
 * is currency or a count, the unit is fixed, and there is no current-value
 * field at all because the number is read from your deals. Pick Manual and the
 * unit field appears. One choice reshapes the form rather than showing six
 * fields where three don't apply.
 *
 * Dates are never typed for quarters or years — they're derived from the
 * selection. That's the fix for the drift already in the data, where one goal
 * is labelled 2027 Q4 and spans seventeen months. "Custom range" exists
 * because that goal is real; it just has to say so.
 */

export interface DraftGoal {
  objective: string;
  period: string;
  start_date: string;
  end_date: string;
  measureName: string;
  source: KeyResultSource;
  target: number;
  unit: string | null;
}

type PeriodKind = "quarter" | "year" | "custom";

const SOURCE_OPTIONS = KEY_RESULT_SOURCES.map((s) => ({
  value: s,
  label: KEY_RESULT_SOURCE_LABELS[s],
}));

const QUARTER_OPTIONS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }));

const KIND_OPTIONS: { value: PeriodKind; label: string }[] = [
  { value: "quarter", label: "A quarter" },
  { value: "year", label: "A full year" },
  { value: "custom", label: "Custom range" },
];

/** Prefills that skip most of the form. */
const TEMPLATES: { label: string; source: KeyResultSource; target: string; unit?: string }[] = [
  { label: "Revenue target", source: "revenue_won", target: "" },
  { label: "Sign N clients", source: "new_clients", target: "" },
  { label: "Ship N projects", source: "tasks_done", target: "" },
  { label: "Something manual", source: "manual", target: "", unit: "" },
];

export function GoalComposer({
  formatCurrency,
  onCancel,
  onCreate,
  saving,
}: {
  /** Formats a number in the display currency — the composer doesn't own that. */
  formatCurrency: (value: number) => string;
  onCancel: () => void;
  onCreate: (draft: DraftGoal) => void;
  saving: boolean;
}) {
  const today = useMemo(() => new Date(), []);
  const [kind, setKind] = useState<PeriodKind>("quarter");
  const [quarterChoice, setQuarterChoice] = useState<PeriodChoice>(() => quarterOf(today));
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);
  const [source, setSource] = useState<KeyResultSource>("revenue_won");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [objectiveOverride, setObjectiveOverride] = useState("");

  const year =
    quarterChoice.kind === "custom" ? today.getFullYear() : quarterChoice.year;
  const quarter = quarterChoice.kind === "quarter" ? quarterChoice.quarter : 1;

  const choice: PeriodChoice | null = useMemo(() => {
    if (kind === "quarter") return { kind: "quarter", year, quarter };
    if (kind === "year") return { kind: "year", year };
    if (customStart && customEnd) return { kind: "custom", start: customStart, end: customEnd };
    return null;
  }, [kind, year, quarter, customStart, customEnd]);

  const bounds = choice ? periodBounds(choice) : null;
  const money = isMoneySource(source);
  const targetNumber = Number(target);
  const targetValid = target.trim() !== "" && Number.isFinite(targetNumber) && targetNumber > 0;

  const suggested = targetValid
    ? composeObjective({
        target: targetNumber,
        source,
        unit,
        formattedTarget: money ? formatCurrency(targetNumber) : String(targetNumber),
      })
    : "";

  const objective = objectiveOverride.trim() || suggested;
  const canSave = targetValid && !!choice && !!bounds && !!objective;

  function submit() {
    if (!canSave || !choice || !bounds) return;
    onCreate({
      objective,
      period: periodLabel(choice),
      start_date: bounds.start,
      end_date: bounds.end,
      measureName: defaultMeasureName({ target: targetNumber, source, unit }),
      source,
      target: targetNumber,
      unit: source === "manual" && unit.trim() ? unit.trim() : null,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-elevated p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => {
              setSource(t.source);
              setUnit(t.unit ?? "");
              setTarget(t.target);
            }}
            className={cnPill(source === t.source)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-4 flex flex-col gap-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Target</Label>
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder={money ? "200000" : "8"}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div>
            <Label>Measured by</Label>
            <Dropdown
              value={source}
              options={SOURCE_OPTIONS}
              onChange={(v) => setSource(v as KeyResultSource)}
            />
          </div>
          <div>
            {/* Only manual measures have a unit to name. An auto source
                already knows whether it counts money, clients or tasks, so
                asking would invite a contradiction. */}
            <Label>{source === "manual" ? "Unit" : "Tracking"}</Label>
            {source === "manual" ? (
              <Input
                placeholder="sessions"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            ) : (
              <div className="flex h-9 items-center gap-1.5 rounded-md border border-edge px-2.5 text-[12.5px] text-muted-foreground">
                <Bolt className="h-3.5 w-3.5 text-[var(--success-fg)]" aria-hidden="true" />
                Updates itself
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Runs for</Label>
            <Dropdown
              value={kind}
              options={KIND_OPTIONS}
              onChange={(v) => setKind(v as PeriodKind)}
            />
          </div>

          {kind === "custom" ? (
            <>
              <div>
                <Label>Starts</Label>
                <DatePicker value={customStart} onChange={setCustomStart} placeholder="Start" />
              </div>
              <div>
                <Label>Ends</Label>
                <DatePicker value={customEnd} onChange={setCustomEnd} placeholder="End" />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Year</Label>
                <Dropdown
                  value={String(year)}
                  options={yearOptions(today).map((y) => ({
                    value: String(y),
                    label: String(y),
                  }))}
                  onChange={(v) =>
                    setQuarterChoice({ kind: "quarter", year: Number(v), quarter })
                  }
                />
              </div>
              {kind === "quarter" && (
                <div>
                  <Label>Quarter</Label>
                  <Dropdown
                    value={String(quarter)}
                    options={QUARTER_OPTIONS}
                    onChange={(v) =>
                      setQuarterChoice({
                        kind: "quarter",
                        year,
                        quarter: Number(v) as 1 | 2 | 3 | 4,
                      })
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <Label>Name (optional)</Label>
          <Input
            placeholder={suggested || "Written from the target once you set one"}
            value={objectiveOverride}
            onChange={(e) => setObjectiveOverride(e.target.value)}
          />
        </div>

        {bounds && (
          <p className="text-xs text-muted-foreground">
            {objective ? <span className="text-foreground">{objective}</span> : "Set a target"}
            {" — "}
            {formatDate(bounds.start)} to {formatDate(bounds.end)}
            {kind !== "custom" && ", derived from the period"}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!canSave || saving}>
            {saving ? "Creating..." : "Create goal"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function cnPill(active: boolean): string {
  return [
    "rounded-full border px-3 py-1 text-[12px] transition-colors",
    active
      ? "border-primary/40 bg-primary/10 text-foreground"
      : "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
  ].join(" ");
}

export { nextQuarter };
