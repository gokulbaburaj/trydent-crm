"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Wallet } from "lucide-react";
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
import type { Client, CurrencyCode, Project, ProjectAllocation } from "@/lib/types";

/**
 * Accounts — money allotted per project, and how much of it is committed to
 * the people doing the work.
 *
 * Each project's budget is held in ITS OWN currency (same convention as deals),
 * so a project quoted in INR is never silently reported in dollars. The
 * cross-project totals at the top convert through `toBase` first.
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
  const { rows: staff } = useStaffProfiles();

  const [open, setOpen] = useState<string | null>(null);
  const [personDraft, setPersonDraft] = useState("");
  const [amountDraft, setAmountDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "—";
  const person = (id: string) => staff.find((p) => p.id === id) ?? null;
  const ccy = (p: Project): CurrencyCode => (p.currency as CurrencyCode) ?? base;

  const byProject = useMemo(() => {
    const map = new Map<string, ProjectAllocation[]>();
    for (const a of allocations) {
      const list = map.get(a.project_id);
      if (list) list.push(a);
      else map.set(a.project_id, [a]);
    }
    return map;
  }, [allocations]);

  const rows = useMemo(
    () =>
      projects
        .map((p) => {
          const lines = byProject.get(p.id) ?? [];
          const committed = lines.reduce((s, a) => s + Number(a.amount), 0);
          const paidOut = lines
            .filter((a) => a.paid)
            .reduce((s, a) => s + Number(a.amount), 0);
          const budget = Number(p.budget) || 0;
          return {
            project: p,
            lines,
            budget,
            committed,
            paidOut,
            remaining: budget - committed,
            pct: budget > 0 ? Math.min(100, Math.round((committed / budget) * 100)) : 0,
          };
        })
        .sort((a, b) => b.budget - a.budget),
    [projects, byProject]
  );

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
    const amount = Number(amountDraft);
    if (!personDraft || Number.isNaN(amount)) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_allocations")
      .insert({
        project_id: projectId,
        profile_id: personDraft,
        amount,
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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Accounts</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What each project is worth, and what&apos;s committed to the people working on it.
        </p>
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

                <div className="flex items-center gap-1.5">
                  <div className="w-28">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      aria-label={`Budget for ${project.name}`}
                      value={budget || ""}
                      placeholder="Budget"
                      onChange={(e) =>
                        updateProject(project.id, { budget: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="w-24">
                    <Dropdown
                      value={ccy(project)}
                      options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
                      onChange={(v) =>
                        updateProject(project.id, { currency: v as CurrencyCode })
                      }
                    />
                  </div>
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
                  {lines.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nobody allocated yet. Add the people working on this project below.
                    </p>
                  )}
                  {lines.map((a) => {
                    const p = person(a.profile_id);
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
                        <div className="w-28">
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
                    <div className="w-28">
                      <Label>Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={amountDraft}
                        onChange={(e) => setAmountDraft(e.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!personDraft || amountDraft === ""}>
                      <Plus className="h-3.5 w-3.5" /> Allocate
                    </Button>
                  </form>

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
