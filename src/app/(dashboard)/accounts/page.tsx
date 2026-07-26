"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES, formatMoney, useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { Client, CurrencyCode, Deal, Project, ProjectAllocation } from "@/lib/types";

/**
 * Accounts — money allotted per project, and how much of it is committed to
 * the people doing the work.
 *
 * The allotment comes from the PIPELINE by default. A project links to the deal
 * that paid for it and inherits its value and currency, so the number is
 * entered once and can't drift. Manual entry stays available for work with no
 * deal behind it (internal projects, favours, retainer overflow).
 *
 * Amounts are held in the project's own currency; the totals at the top convert
 * through `toBase` first so mixed-currency projects add up correctly.
 */
export default function AccountsPage() {
  return (
    <RequireAccess page="accounts">
      <AccountsInner />
    </RequireAccess>
  );
}

function AccountsInner() {
  const { format: formatCurrency, toBase, base } = useCurrency();
  const { rows: projects, setRows: setProjects, loading } =
    useSupabaseTable<Project>("projects");
  const { rows: allocations, setRows: setAllocations } =
    useSupabaseTable<ProjectAllocation>("project_allocations");
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: staff } = useStaffProfiles();

  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [personDraft, setPersonDraft] = useState("");
  const [amountDraft, setAmountDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [basisDraft, setBasisDraft] = useState<"percent" | "fixed">("percent");

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  const person = (id: string) => staff.find((p) => p.id === id) ?? null;
  const dealFor = (p: Project) => deals.find((d) => d.id === p.deal_id) ?? null;

  /** A linked deal owns both the amount and the currency. */
  const ccy = (p: Project): CurrencyCode => {
    const d = dealFor(p);
    return ((d?.currency ?? p.currency) as CurrencyCode) ?? base;
  };
  const budgetOf = (p: Project) => {
    const d = dealFor(p);
    return d ? Number(d.deal_value) : Number(p.budget) || 0;
  };

  const byProject = useMemo(() => {
    const map = new Map<string, ProjectAllocation[]>();
    for (const a of allocations) {
      const list = map.get(a.project_id);
      if (list) list.push(a);
      else map.set(a.project_id, [a]);
    }
    return map;
  }, [allocations]);

  /** A percentage line is worth a share of the budget; a fixed line is its
   *  own amount. Percentages recalculate the moment the deal value changes,
   *  which is the whole point of using them. */
  const payoutOf = (a: ProjectAllocation, budget: number) =>
    a.percent != null ? (budget * Number(a.percent)) / 100 : Number(a.amount);

  const rows = useMemo(
    () =>
      projects
        .filter((p) => showArchived || !p.archived)
        .map((p) => {
          const lines = byProject.get(p.id) ?? [];
          const budget = budgetOf(p);
          const committed = lines.reduce((s, a) => s + payoutOf(a, budget), 0);
          const paidOut = lines
            .filter((a) => a.paid)
            .reduce((s, a) => s + payoutOf(a, budget), 0);
          return {
            project: p,
            lines,
            budget,
            committed,
            paidOut,
            remaining: budget - committed,
            pct: budget > 0 ? Math.round((committed / budget) * 100) : 0,
          };
        })
        .sort((a, b) => b.budget - a.budget),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, byProject, deals, showArchived]
  );

  const archivedCount = projects.filter((p) => p.archived).length;

  /** Cross-project totals, converted to the display currency. */
  const totals = useMemo(() => {
    let budget = 0;
    let committed = 0;
    let paidOut = 0;
    for (const r of rows) {
      const c = ccy(r.project);
      budget += toBase(r.budget, c);
      committed += toBase(r.committed, c);
      paidOut += toBase(r.paidOut, c);
    }
    return { budget, committed, paidOut, remaining: budget - committed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, toBase, base]);

  async function updateProject(id: string, patch: Partial<Project>) {
    const before = projects;
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) {
      setProjects(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function addAllocation(projectId: string) {
    const value = Number(amountDraft);
    if (!personDraft || Number.isNaN(value)) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_allocations")
      .insert({
        project_id: projectId,
        profile_id: personDraft,
        amount: basisDraft === "fixed" ? value : 0,
        percent: basisDraft === "percent" ? value : null,
        role_label: roleDraft.trim() || null,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(
        error?.message.includes("duplicate")
          ? "That person already has an allocation on this project."
          : `Couldn't add: ${error?.message ?? "unknown error"}`
      );
      return;
    }
    setAllocations((prev) => [...prev, data as ProjectAllocation]);
    setPersonDraft("");
    setAmountDraft("");
    setRoleDraft("");
  }

  async function updateAllocation(id: string, patch: Partial<ProjectAllocation>) {
    const before = allocations;
    setAllocations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_allocations").update(patch).eq("id", id);
    if (error) {
      setAllocations(before);
      toast.error(`Couldn't save: ${error.message}`);
    }
  }

  async function deleteAllocation(id: string) {
    const before = allocations;
    setAllocations((prev) => prev.filter((a) => a.id !== id));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("project_allocations").delete().eq("id", id);
    if (error) setAllocations(before);
  }

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Accounts</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What each project is worth, and what&apos;s committed to the people working on it.
          </p>
        </div>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
              showArchived
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Hiding nothing" : `Show archived (${archivedCount})`}
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Allotted" value={formatCurrency(totals.budget)} />
        <Summary label="Committed to team" value={formatCurrency(totals.committed)} />
        <Summary label="Paid out" value={formatCurrency(totals.paidOut)} tone="success" />
        <Summary
          label={totals.remaining < 0 ? "Over budget" : "Unallocated"}
          value={formatCurrency(Math.abs(totals.remaining))}
          tone={totals.remaining < 0 ? "danger" : "warning"}
        />
      </div>

      {rows.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No projects yet"
          description="Create a project, set its budget here, then allocate money to the people on it."
        />
      )}

      <div className="flex flex-col gap-2">
        {rows.map(({ project, lines, budget, committed, paidOut, remaining, pct }) => {
          const isOpen = open === project.id;
          const over = remaining < 0;
          return (
            <Card key={project.id} className="rounded-xl shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : project.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 truncate text-sm font-medium">{project.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {clientName(project.client_id)}
                  </span>
                </button>

                {/* The allotment is always shown as a number, whatever its
                    source — before, a linked deal hid it inside the picker. */}
                <div className="shrink-0 text-right">
                  <p className="text-base font-semibold tabular-nums text-foreground">
                    {formatMoney(budget, ccy(project))}
                  </p>
                  <p className="text-[11px] text-muted-2">allotted</p>
                </div>

                <div className="w-40 shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground">
                    {formatMoney(committed, ccy(project))} committed
                  </p>
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      over ? "text-danger" : "text-muted-2"
                    )}
                  >
                    {over
                      ? `${formatMoney(Math.abs(remaining), ccy(project))} over`
                      : `${formatMoney(remaining, ccy(project))} left`}
                  </p>
                </div>

                <Badge tone={over ? "red" : pct >= 100 ? "green" : "gray"}>{pct}%</Badge>

                <button
                  type="button"
                  title={project.archived ? "Restore project" : "Archive project"}
                  onClick={() =>
                    updateProject(project.id, { archived: !project.archived })
                  }
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  {project.archived ? (
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  ) : (
                    <Archive className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    over ? "bg-danger" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              {isOpen && (
                <div className="mt-3.5 flex flex-col gap-2 border-t border-border-subtle pt-3">
                  {/* Where the money comes from */}
                  <div className="flex flex-wrap items-end gap-2 pb-1">
                    <div className="min-w-[13rem] flex-1">
                      <Label>Allotment source</Label>
                      <Dropdown
                        value={project.deal_id ?? ""}
                        placeholder="Manual amount"
                        options={[
                          { value: "", label: "Manual amount" },
                          ...deals
                            .filter((d) => d.client_id === project.client_id)
                            .map((d) => ({
                              value: d.id,
                              label: `${d.deal_name} · ${formatMoney(
                                Number(d.deal_value),
                                (d.currency as CurrencyCode) ?? base
                              )}`,
                            })),
                        ]}
                        onChange={(v) => updateProject(project.id, { deal_id: v || null })}
                      />
                    </div>
                    {project.deal_id ? (
                      <p className="pb-2 text-[11px] text-muted-2">
                        Value and currency follow the deal. Change it in Pipeline.
                      </p>
                    ) : (
                      <>
                        <div className="w-28">
                          <Label>Amount</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Budget for ${project.name}`}
                            value={project.budget || ""}
                            placeholder="0.00"
                            onChange={(e) =>
                              updateProject(project.id, { budget: Number(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div className="w-24">
                          <Label>Currency</Label>
                          <Dropdown
                            value={project.currency ?? base}
                            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
                            onChange={(v) =>
                              updateProject(project.id, { currency: v as CurrencyCode })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {lines.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nobody allocated yet. Add the people working on this project below.
                    </p>
                  )}
                  {lines.map((a) => {
                    const p = person(a.profile_id);
                    const isPct = a.percent != null;
                    const payout = payoutOf(a, budget);
                    return (
                      <div key={a.id} className="group flex flex-wrap items-center gap-2">
                        <Avatar name={p?.full_name ?? "Unknown"} url={p?.avatar_url} size="xs" />
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {p?.full_name ?? "Removed member"}
                          {a.role_label && (
                            <span className="ml-1.5 text-[11px] text-muted-2">
                              {a.role_label}
                            </span>
                          )}
                        </span>

                        {/* Switch a line between a share of the fee and a flat
                            amount. Percentages re-derive when the deal changes. */}
                        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
                          {(["percent", "fixed"] as const).map((mode) => {
                            const active = mode === "percent" ? isPct : !isPct;
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  updateAllocation(
                                    a.id,
                                    mode === "percent"
                                      ? {
                                          percent:
                                            budget > 0
                                              ? Math.round((Number(a.amount) / budget) * 100)
                                              : 0,
                                        }
                                      : { percent: null, amount: payout }
                                  )
                                }
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                                  active
                                    ? "bg-white/10 font-medium text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {mode === "percent" ? "%" : "Fixed"}
                              </button>
                            );
                          })}
                        </div>

                        {isPct ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <div className="w-20">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                aria-label={`Share for ${p?.full_name ?? "member"}`}
                                value={a.percent ?? 0}
                                onChange={(e) =>
                                  updateAllocation(a.id, {
                                    percent: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <span className="w-24 text-right text-[13px] tabular-nums text-foreground-secondary">
                              {formatMoney(payout, ccy(project))}
                            </span>
                          </div>
                        ) : (
                          <div className="w-28 shrink-0">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              aria-label={`Amount for ${p?.full_name ?? "member"}`}
                              value={a.amount}
                              onChange={(e) =>
                                updateAllocation(a.id, { amount: Number(e.target.value) || 0 })
                              }
                            />
                          </div>
                        )}

                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={a.paid}
                            onChange={() => updateAllocation(a.id, { paid: !a.paid })}
                            className="h-3.5 w-3.5 rounded accent-primary"
                          />
                          Paid
                        </label>
                        <button
                          type="button"
                          aria-label="Remove allocation"
                          onClick={() => deleteAllocation(a.id)}
                          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addAllocation(project.id);
                    }}
                    className="mt-1 flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle bg-white/[0.02] p-2.5"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <Label>Person</Label>
                      <Dropdown
                        value={personDraft}
                        placeholder="Choose"
                        options={staff.map((s) => ({ value: s.id, label: s.full_name }))}
                        onChange={setPersonDraft}
                      />
                    </div>
                    <div className="w-32">
                      <Label>Role</Label>
                      <Input
                        placeholder="Editor"
                        value={roleDraft}
                        onChange={(e) => setRoleDraft(e.target.value)}
                      />
                    </div>
                    <div className="w-24">
                      <Label>Basis</Label>
                      <Dropdown
                        value={basisDraft}
                        options={[
                          { value: "percent", label: "%" },
                          { value: "fixed", label: "Fixed" },
                        ]}
                        onChange={(v) => setBasisDraft(v as "percent" | "fixed")}
                      />
                    </div>
                    <div className="w-28">
                      <Label>{basisDraft === "percent" ? "Share %" : "Amount"}</Label>
                      <Input
                        type="number"
                        min="0"
                        max={basisDraft === "percent" ? 100 : undefined}
                        step={basisDraft === "percent" ? "0.1" : "0.01"}
                        placeholder={basisDraft === "percent" ? "30" : "0.00"}
                        value={amountDraft}
                        onChange={(e) => setAmountDraft(e.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!personDraft || amountDraft === ""}>
                      <Plus className="h-3.5 w-3.5" /> Allocate
                    </Button>
                  </form>

                  {/* Total share, so an over-allocation is obvious before it
                      shows up as a money overrun. */}
                  {lines.some((a) => a.percent != null) && (
                    <p
                      className={cn(
                        "text-[11px]",
                        totalPercent(lines) > 100 ? "text-danger" : "text-muted-2"
                      )}
                    >
                      {totalPercent(lines)}% of the fee allocated by share.
                    </p>
                  )}

                  {paidOut > 0 && (
                    <p className="text-[11px] text-success">
                      {formatMoney(paidOut, ccy(project))} already paid out.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Sum of the share-based lines, rounded for display. */
function totalPercent(lines: ProjectAllocation[]) {
  return Math.round(
    lines.reduce((s, a) => s + (a.percent != null ? Number(a.percent) : 0), 0)
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
}) {
  return (
    <Card className="rounded-xl shadow-sm">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
