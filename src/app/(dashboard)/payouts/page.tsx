"use client";

import { useMemo, useState } from "react";
import { Banknote, ChevronDown, Wallet } from "lucide-react";
import { toast } from "@/components/Toaster";
import { reportError } from "@/lib/reportError";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAccess } from "@/components/RequireAccess";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { createClient } from "@/lib/supabase/client";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  allocationAmount,
  groupOwedByPerson,
  monthOverMonth,
  payoutTotals,
  type OwedLine,
} from "@/lib/payouts";
import type {
  CurrencyCode,
  Deal,
  Payout,
  PayoutLine,
  Project,
  ProjectAllocation,
  StaffPayment,
} from "@/lib/types";

/**
 * Payouts — money leaving, grouped by the person it goes to.
 *
 * ── Why this replaced Accounts ──────────────────────────────────────────────
 *
 * Accounts asked "what is each project worth, and what's committed out of it".
 * That's the right question while pricing work and the wrong one while paying
 * people: you pay Ravi once, for three lines across two projects, and the old
 * page could only show you those three lines in three different places.
 *
 * Two things it couldn't answer at all:
 *
 *   * WHEN anything was paid. `project_allocations.paid` was a boolean, so
 *     "paid this month" had no way to exist. See 2026-08-11e.
 *   * The full amount owed. `staff_payments` holds one-off payments and the
 *     page never read it, so every header total was short by whatever was in
 *     there.
 *
 * The arithmetic lives in lib/payouts.ts with its own tests; this file is the
 * assembly and the writes.
 */

export default function PayoutsPage() {
  return (
    <RequireAccess page="accounts">
      <PayoutsInner />
    </RequireAccess>
  );
}

function PayoutsInner() {
  const { profile } = useAuth();
  const { format: formatCurrency, toBase, base } = useCurrency();

  const { rows: projects, loading } = useSupabaseTable<Project>("projects");
  const { rows: deals } = useSupabaseTable<Deal>("deals");
  const { rows: allocations, setRows: setAllocations } =
    useSupabaseTable<ProjectAllocation>("project_allocations");
  const { rows: staffPayments, setRows: setStaffPayments } =
    useSupabaseTable<StaffPayment>("staff_payments");
  const { rows: staff } = useStaffProfiles();
  const { rows: payouts, setRows: setPayouts } = useSupabaseTable<Payout>("payouts", {
    column: "paid_on",
    ascending: false,
  });
  const { rows: payoutLines, setRows: setPayoutLines } =
    useSupabaseTable<PayoutLine>("payout_lines");

  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [payDate, setPayDate] = useState<string | null>(() => localToday());
  const [paying, setPaying] = useState(false);

  const now = useMemo(() => new Date(), []);
  const personById = useMemo(
    () => new Map(staff.map((p) => [p.id, p])),
    [staff]
  );
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const dealById = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);

  /** A project's money comes from its deal when it has one. */
  const budgetOf = (project: Project) => {
    const deal = project.deal_id ? dealById.get(project.deal_id) : null;
    return deal ? Number(deal.deal_value) : Number(project.budget) || 0;
  };
  const currencyOf = (project: Project): CurrencyCode => {
    const deal = project.deal_id ? dealById.get(project.deal_id) : null;
    return ((deal?.currency ?? project.currency) as CurrencyCode) ?? base;
  };

  /** Both sources, flattened into one shape. */
  const owedLines = useMemo<OwedLine[]>(() => {
    const fromAllocations = allocations.flatMap((a): OwedLine[] => {
      const project = projectById.get(a.project_id);
      if (!project) return [];
      return [
        {
          id: a.id,
          kind: "allocation",
          personId: a.profile_id,
          label: project.name,
          sublabel: [a.role_label, a.percent != null ? `${a.percent}%` : "fixed"]
            .filter(Boolean)
            .join(" · "),
          amount: allocationAmount(a, budgetOf(project)),
          currency: currencyOf(project),
          paid: a.paid,
        },
      ];
    });

    const fromPayments = staffPayments.map((p): OwedLine => ({
      id: p.id,
      kind: "payment",
      personId: p.profile_id,
      label: p.label,
      sublabel: p.due_date ? `one-off · due ${formatDate(p.due_date)}` : "one-off",
      amount: Number(p.amount) || 0,
      // staff_payments predates multi-currency and has no column for it.
      currency: base,
      paid: p.status === "paid",
    }));

    return [...fromAllocations, ...fromPayments];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocations, staffPayments, projectById, dealById, base]);

  const owed = useMemo(() => groupOwedByPerson(owedLines, toBase), [owedLines, toBase]);
  const owedTotal = owed.reduce((sum, p) => sum + p.total, 0);

  /** A payout's value is the sum of its lines, in the base currency. */
  const linesByPayout = useMemo(() => {
    const map = new Map<string, PayoutLine[]>();
    for (const l of payoutLines) {
      const list = map.get(l.payout_id);
      if (list) list.push(l);
      else map.set(l.payout_id, [l]);
    }
    return map;
  }, [payoutLines]);

  const payoutRows = useMemo(
    () =>
      payouts.map((p) => {
        const lines = linesByPayout.get(p.id) ?? [];
        return {
          payout: p,
          lines,
          // Lines are stored in the base currency at the time of paying —
          // see the snapshot note in 2026-08-11e.
          amount: lines.reduce((sum, l) => sum + Number(l.amount), 0),
        };
      }),
    [payouts, linesByPayout]
  );

  const totals = useMemo(
    () =>
      payoutTotals(
        payoutRows.map((r) => ({ paidOn: r.payout.paid_on, amount: r.amount, currency: base })),
        now,
        toBase
      ),
    [payoutRows, now, toBase, base]
  );
  const mom = monthOverMonth(totals);

  /** Committed but not yet handed over — what the old page called Unallocated. */
  const unallocated = useMemo(() => {
    let total = 0;
    for (const project of projects) {
      if (project.archived) continue;
      const budget = budgetOf(project);
      const committed = allocations
        .filter((a) => a.project_id === project.id)
        .reduce((sum, a) => sum + allocationAmount(a, budget), 0);
      total += toBase(Math.max(0, budget - committed), currencyOf(project));
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, allocations, dealById, toBase, base]);

  function toggleLine(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function payOut(personId: string) {
    const group = owed.find((g) => g.personId === personId);
    if (!group || !payDate) return;
    const selected = group.lines.filter((l) => !excluded.has(l.id));
    if (selected.length === 0) return;

    const person = personById.get(personId);
    const total = selected.reduce((sum, l) => sum + toBase(l.amount, l.currency), 0);

    const ok = await confirmAction({
      title: `Pay ${person?.full_name ?? "this person"} ${formatCurrency(total)}?`,
      body: `Covers ${selected.length} line${selected.length === 1 ? "" : "s"}, dated ${formatDate(payDate)}. It'll show in the payout history and those lines stop counting as owed.`,
      confirmLabel: "Record payout",
      tone: "neutral",
    });
    if (!ok) return;

    setPaying(true);
    const supabase = createClient();
    if (!supabase) {
      setPaying(false);
      return;
    }

    const { data: payout, error } = await supabase
      .from("payouts")
      .insert({ profile_id: personId, paid_on: payDate, created_by: profile?.id ?? null })
      .select()
      .single();

    if (error || !payout) {
      setPaying(false);
      reportError("record the payout", error);
      return;
    }

    /*
      Amounts are converted to base and frozen onto the line. A percentage
      allocation recomputes whenever the deal value moves; a payout must not.
      What left the account last month cannot change because someone edited a
      deal today.
    */
    const { data: lines, error: lineError } = await supabase
      .from("payout_lines")
      .insert(
        selected.map((l) => ({
          payout_id: payout.id,
          allocation_id: l.kind === "allocation" ? l.id : null,
          staff_payment_id: l.kind === "payment" ? l.id : null,
          amount: toBase(l.amount, l.currency),
          label: l.sublabel ? `${l.label} · ${l.sublabel}` : l.label,
        }))
      )
      .select();

    setPaying(false);

    if (lineError || !lines) {
      // Without lines the payout is an empty record that still shows in the
      // history at zero. Roll it back rather than leave that behind.
      await supabase.from("payouts").delete().eq("id", payout.id);
      reportError("record the payout", lineError);
      return;
    }

    setPayouts((prev) => [payout as Payout, ...prev]);
    setPayoutLines((prev) => [...prev, ...(lines as PayoutLine[])]);
    // The trigger flipped `paid` / `status` server-side; mirror it locally so
    // the row leaves the owed list without a refetch.
    const allocIds = selected.filter((l) => l.kind === "allocation").map((l) => l.id);
    const paymentIds = selected.filter((l) => l.kind === "payment").map((l) => l.id);
    if (allocIds.length) {
      setAllocations((prev) =>
        prev.map((a) => (allocIds.includes(a.id) ? { ...a, paid: true } : a))
      );
    }
    if (paymentIds.length) {
      setStaffPayments((prev) =>
        prev.map((p) => (paymentIds.includes(p.id) ? { ...p, status: "paid" as const } : p))
      );
    }
    setOpenPerson(null);
    setExcluded(new Set());
    toast.success(`Paid ${person?.full_name ?? "team member"} ${formatCurrency(total)}`);
  }

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        What you owe the people doing the work, and what&apos;s gone out.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Owed now" value={formatCurrency(owedTotal)}>
          {owed.length > 0
            ? `across ${owed.length} ${owed.length === 1 ? "person" : "people"}`
            : "nothing outstanding"}
        </Stat>
        <Stat label="Paid this month" value={formatCurrency(totals.thisMonth)}>
          {mom === null
            ? "no payouts last month to compare"
            : `${mom >= 0 ? "+" : ""}${mom}% vs last month`}
        </Stat>
        <Stat label="Unallocated" value={formatCurrency(unallocated)}>
          not committed to anyone
        </Stat>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Owed now</h2>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        {owed.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nobody is owed anything"
            description="Allocate people to a project in Projects, or add a one-off payment on the Team page."
          />
        ) : (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-elevated">
            {owed.map((group) => {
              const person = personById.get(group.personId);
              const open = openPerson === group.personId;
              const selected = group.lines.filter((l) => !excluded.has(l.id));
              const selectedTotal = selected.reduce(
                (sum, l) => sum + toBase(l.amount, l.currency),
                0
              );
              return (
                <div key={group.personId}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenPerson(open ? null : group.personId);
                        setExcluded(new Set());
                      }}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-2 transition-transform duration-200 ease-[var(--ease-out)]",
                          open && "rotate-180"
                        )}
                        aria-hidden="true"
                      />
                      <Avatar name={person?.full_name ?? "?"} url={person?.avatar_url} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {person?.full_name ?? "Unknown"}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {group.lines.length} line{group.lines.length === 1 ? "" : "s"}
                      </span>
                      <span className="shrink-0 text-[14px] font-medium tabular-nums">
                        {formatCurrency(group.total)}
                      </span>
                    </button>
                  </div>

                  {open && (
                    <div className="border-t border-border-subtle bg-raise px-4 py-3">
                      <ul className="flex flex-col">
                        {group.lines.map((l) => (
                          <li
                            key={l.id}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-border-subtle py-2 text-[13px] first:border-t-0"
                          >
                            <Checkbox
                              checked={!excluded.has(l.id)}
                              onChange={() => toggleLine(l.id)}
                              label=""
                            />
                            <div className="min-w-0">
                              <div className="truncate">{l.label}</div>
                              {l.sublabel && (
                                <div className="truncate text-[11px] text-muted-2">
                                  {l.sublabel}
                                </div>
                              )}
                            </div>
                            <span className="shrink-0 tabular-nums">
                              {formatCurrency(l.amount, l.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                        <div className="w-40">
                          <DatePicker value={payDate} onChange={setPayDate} placeholder="Paid on" />
                        </div>
                        <Button
                          size="sm"
                          disabled={selected.length === 0 || paying || !payDate}
                          onClick={() => payOut(group.personId)}
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          {paying ? "Recording..." : `Pay out ${formatCurrency(selectedTotal)}`}
                        </Button>
                        {selected.length !== group.lines.length && (
                          <span className="text-[12px] text-muted-foreground">
                            {group.lines.length - selected.length} line
                            {group.lines.length - selected.length === 1 ? "" : "s"} held back
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Payout history</h2>
          <span className="text-[11px] text-muted-foreground">
            {formatCurrency(totals.allTime)} all time
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        {payoutRows.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="No payouts recorded"
            description="Once you pay someone, it shows here with the date and what it covered."
          />
        ) : (
          <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border bg-elevated">
            {payoutRows.map(({ payout, lines, amount }) => {
              const person = personById.get(payout.profile_id);
              return (
                <div
                  key={payout.id}
                  className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-[13px]"
                >
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatDate(payout.paid_on)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{person?.full_name ?? "Unknown"}</div>
                    <div className="truncate text-[11px] text-muted-2">
                      {lines.map((l) => l.label).filter(Boolean).join(" · ") || "—"}
                    </div>
                    {payout.note && (
                      <div className="truncate text-[11px] text-muted-2">{payout.note}</div>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums">{formatCurrency(amount)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-4">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[22px] font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-[11.5px] text-muted-2">{children}</p>
    </div>
  );
}

/** Today in the viewer's timezone — `toISOString` would give yesterday east of UTC. */
function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
