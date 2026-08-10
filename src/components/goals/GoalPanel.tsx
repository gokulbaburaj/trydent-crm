"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatDate } from "@/lib/format";
import { isMoneySource } from "@/lib/goals";
import { periodBounds, periodLabel, yearOptions, type PeriodChoice } from "@/lib/goalPeriod";
import {
  KEY_RESULT_SOURCES,
  KEY_RESULT_SOURCE_LABELS,
  type GoalContribution,
  type Goal,
  type KeyResult,
  type KeyResultSource,
} from "@/lib/types";

/**
 * The expanded half of a goal row: what you've put in, and what the goal is.
 *
 * ── Why a log rather than a number field ────────────────────────────────────
 *
 * The row used to carry a bare input holding the running total, so recording
 * ₹5,000 meant reading the old value, adding it yourself and typing the
 * answer. The arithmetic was yours to get wrong, nothing recorded WHEN
 * anything happened, and a mistake couldn't be undone without recomputing
 * everything after it.
 *
 * Here you type what you added. The note field earns its place on a goal like
 * "recruit 10 people", where the log becomes the list of who was hired.
 *
 * ── Why editing lives here too ──────────────────────────────────────────────
 *
 * There was no way to change a goal at all — only delete it and start again.
 * Putting the fields under the log keeps one goal in one place, and means the
 * period stays a pair of selects rather than a typed string, which is what
 * let the dates drift from their labels in the first place.
 */

/** Today as YYYY-MM-DD in the viewer's own timezone. */
function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export interface GoalEdits {
  objective: string;
  target: number;
  unit: string | null;
  source: KeyResultSource;
  period: string;
  start_date: string;
  end_date: string;
}

const SOURCE_OPTIONS = KEY_RESULT_SOURCES.map((s) => ({
  value: s,
  label: KEY_RESULT_SOURCE_LABELS[s],
}));
const QUARTER_OPTIONS = [1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }));
const KIND_OPTIONS = [
  { value: "quarter", label: "A quarter" },
  { value: "year", label: "A full year" },
  { value: "custom", label: "Custom range" },
];

export function GoalPanel({
  goal,
  measure,
  contributions,
  choice,
  mode,
  formatValue,
  onAddContribution,
  onDeleteContribution,
  onSaveGoal,
}: {
  goal: Goal;
  measure: KeyResult | null;
  contributions: GoalContribution[];
  choice: PeriodChoice | null;
  /** "log" opens on the history; "edit" opens on the goal's fields. */
  mode: "log" | "edit";
  formatValue: (v: number) => string;
  onAddContribution: (amount: number, occurredOn: string, note: string | null) => void;
  onDeleteContribution: (id: string) => void;
  onSaveGoal: (edits: GoalEdits) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const manual = measure?.source === "manual";

  /*
    The log form is hidden until asked for. It used to render open on every
    expand, which put a live number field in front of you whether or not you
    came to record anything — the same mistake as the edit form below.
  */
  const [logging, setLogging] = useState(false);
  const [amount, setAmount] = useState("");
  /*
    Local date, not UTC. `toISOString().slice(0,10)` was defaulting the picker
    to Aug 10 while the calendar said Aug 11 — anywhere east of UTC, early
    local morning is still yesterday in UTC. Logging "what I did today" and
    getting yesterday's date is silently wrong, and pace reads these dates.
    Same trap as the date parsing in lib/goalPace.ts.
  */
  const [occurredOn, setOccurredOn] = useState<string | null>(() => localToday());
  const [note, setNote] = useState("");

  const [objective, setObjective] = useState(goal.objective);
  const [target, setTarget] = useState(String(measure?.target ?? ""));
  const [unit, setUnit] = useState(measure?.unit ?? "");
  const [source, setSource] = useState<KeyResultSource>(measure?.source ?? "manual");
  const [kind, setKind] = useState<"quarter" | "year" | "custom">(choice?.kind ?? "quarter");
  const [year, setYear] = useState(
    choice && choice.kind !== "custom" ? choice.year : today.getFullYear()
  );
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(
    choice?.kind === "quarter" ? choice.quarter : 1
  );
  const [customStart, setCustomStart] = useState<string | null>(
    choice?.kind === "custom" ? choice.start : goal.start_date
  );
  const [customEnd, setCustomEnd] = useState<string | null>(
    choice?.kind === "custom" ? choice.end : goal.end_date
  );

  const amountNumber = Number(amount);
  const canLog =
    amount.trim() !== "" && Number.isFinite(amountNumber) && amountNumber !== 0 && !!occurredOn;

  const nextChoice: PeriodChoice | null =
    kind === "quarter"
      ? { kind: "quarter", year, quarter }
      : kind === "year"
        ? { kind: "year", year }
        : customStart && customEnd
          ? { kind: "custom", start: customStart, end: customEnd }
          : null;

  const targetNumber = Number(target);
  const canSave =
    !!nextChoice &&
    objective.trim() !== "" &&
    Number.isFinite(targetNumber) &&
    targetNumber > 0;

  function save() {
    if (!canSave || !nextChoice) return;
    const bounds = periodBounds(nextChoice);
    onSaveGoal({
      objective: objective.trim(),
      target: targetNumber,
      unit: source === "manual" && unit.trim() ? unit.trim() : null,
      source,
      period: periodLabel(nextChoice),
      start_date: bounds.start,
      end_date: bounds.end,
    });
  }

  return (
    <div className="border-t border-border-subtle bg-raise px-4 py-3">
      {manual ? (
        <>
          {!logging && (
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-foreground-secondary transition-colors hover:bg-hover hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Log progress
            </button>
          )}

          {logging && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canLog || !occurredOn) return;
              onAddContribution(amountNumber, occurredOn, note.trim() || null);
              setAmount("");
              setNote("");
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="w-24">
              <Label>Added</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                placeholder="5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
            <div className="w-40">
              <Label>On</Label>
              <DatePicker value={occurredOn} onChange={setOccurredOn} placeholder="Date" />
            </div>
            <div className="min-w-[150px] flex-1">
              <Label>Note</Label>
              <Input
                placeholder="Who, or where it came from"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={!canLog}>
              Log it
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setLogging(false);
                setAmount("");
                setNote("");
              }}
            >
              Cancel
            </Button>
          </form>
          )}

          {contributions.length > 0 && (
            <ul className="mt-3 flex flex-col">
              {contributions.map((c) => (
                <li
                  key={c.id}
                  className="group/entry flex items-center gap-3 border-t border-border-subtle py-1.5 text-[13px] first:border-t-0"
                >
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {formatDate(c.occurred_on)}
                  </span>
                  <span
                    className={
                      // A negative entry is a correction. Showing the sign
                      // rather than styling it as an error keeps the log
                      // readable as arithmetic.
                      Number(c.amount) < 0 ? "w-20 shrink-0 tabular-nums text-muted-foreground" : "w-20 shrink-0 tabular-nums"
                    }
                  >
                    {Number(c.amount) > 0 ? "+" : ""}
                    {formatValue(Number(c.amount))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {c.note ?? ""}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove entry from ${formatDate(c.occurred_on)}`}
                    onClick={() => onDeleteContribution(c.id)}
                    className="shrink-0 rounded-md p-1 text-muted-2 opacity-0 transition-opacity hover:text-[var(--danger-fg)] focus-visible:opacity-100 group-hover/entry:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {contributions.length === 0 && (
            <p className="mt-2 text-[12px] text-muted-2">
              Nothing logged yet. Every entry is what you added, not the new total.
            </p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          {measure ? KEY_RESULT_SOURCE_LABELS[measure.source] : "No measure"} — this reads
          your live data, so there&apos;s nothing to log by hand.
        </p>
      )}

      {mode === "edit" && (
      <div className="mt-3 border-t border-border-subtle pt-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
          <div>
            <Label>Target</Label>
            <Input
              type="number"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <div>
            <Label>{source === "manual" ? "Unit" : "Tracking"}</Label>
            {source === "manual" ? (
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                /* Was "people", which asked a ₹600,000 savings goal whether it
                   counted people. There is no sensible default noun, so the
                   placeholder says the field is optional instead. */
                placeholder="Optional"
              />
            ) : (
              <div className="flex h-9 items-center rounded-md border border-edge px-2.5 text-[12.5px] text-muted-foreground">
                {isMoneySource(source) ? "Money, automatic" : "Count, automatic"}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div>
            <Label>Measured by</Label>
            <Dropdown
              value={source}
              options={SOURCE_OPTIONS}
              onChange={(v) => setSource(v as KeyResultSource)}
            />
          </div>
          <div>
            <Label>Runs for</Label>
            <Dropdown
              value={kind}
              options={KIND_OPTIONS}
              onChange={(v) => setKind(v as "quarter" | "year" | "custom")}
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
                  options={yearOptions(today).map((y) => ({ value: String(y), label: String(y) }))}
                  onChange={(v) => setYear(Number(v))}
                />
              </div>
              {kind === "quarter" && (
                <div>
                  <Label>Quarter</Label>
                  <Dropdown
                    value={String(quarter)}
                    options={QUARTER_OPTIONS}
                    onChange={(v) => setQuarter(Number(v) as 1 | 2 | 3 | 4)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-2.5 flex items-center gap-3">
          <Button type="button" size="sm" onClick={save} disabled={!canSave}>
            Save changes
          </Button>
          {nextChoice && (
            <span className="text-[12px] text-muted-foreground">
              {(() => {
                const b = periodBounds(nextChoice);
                return `${formatDate(b.start)} to ${formatDate(b.end)}`;
              })()}
            </span>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
