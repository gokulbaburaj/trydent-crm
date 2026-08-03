"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  CircleDot,
  ExternalLink,
  Hash,
  Paperclip,
  Receipt,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { DataTable, type Column } from "@/components/DataTable";
import { toast } from "@/components/Toaster";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { openStoredFile } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_TONES,
  effectiveInvoiceStatus,
} from "@/lib/types";
import type {
  Client,
  Invoice,
  InvoiceDisplayStatus,
  InvoiceStatus,
} from "@/lib/types";

/**
 * Invoices — every invoice, across every client.
 *
 * Invoices already existed, but only inside one client's portal panel. That
 * answers "what does Wilson owe me", which is not the question you actually
 * ask. The question is "what am I owed, and what's late", and it has no answer
 * that doesn't involve opening every client in turn.
 *
 * Access deliberately rides on the CLIENTS page key rather than a new one.
 * The RLS policy on `invoices` is `current_can('clients')` — so inventing an
 * `invoices` PageKey here would hide a nav link while the database happily
 * served the rows to anyone with Clients. A permission the data layer doesn't
 * enforce is decoration. If invoices should genuinely split from clients, that
 * starts with a migration to repoint the policy, and the UI follows.
 */

/** Buckets are by how late, because that's the order you chase people in. */
type Bucket = "current" | "1-30" | "31-60" | "60+";

const BUCKET_LABELS: Record<Bucket, string> = {
  current: "Not yet due",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "60+": "60+ days",
};

/**
 * Whole calendar days late, counted midnight to midnight.
 *
 * Not elapsed milliseconds. `effectiveInvoiceStatus` treats the due date as
 * ending at 23:59:59, so subtracting that instant from `Date.now()` makes an
 * invoice due yesterday read "0d late" and pushes a 31-day-old one into the
 * 1–30 bucket. Comparing local midnights gives the number a person would say
 * out loud.
 */
function daysOverdue(inv: Invoice): number | null {
  if (effectiveInvoiceStatus(inv) !== "overdue" || !inv.due_date) return null;
  const [y, m, d] = inv.due_date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dueMidnight = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((todayMidnight - dueMidnight) / 86_400_000);
}

function bucketOf(inv: Invoice): Bucket {
  const d = daysOverdue(inv);
  if (d == null) return "current";
  if (d <= 30) return "1-30";
  if (d <= 60) return "31-60";
  return "60+";
}

type StatusFilter = "all" | InvoiceDisplayStatus;

export default function InvoicesPage() {
  const { rows: invoices, setRows, loading } = useSupabaseTable<Invoice>("invoices", {
    column: "created_at",
    ascending: false,
  });
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { currency, setCurrency, toBase, base, format, converted } = useCurrency();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [clientFilter, setClientFilter] = useState("");

  const companyOf = (id: string) =>
    clients.find((c) => c.id === id)?.company ?? "Unknown client";

  /**
   * Totals follow the client filter but NOT the status filter.
   *
   * Filtering to Wilson and then reading everyone's outstanding balance is a
   * trap. But the cards are themselves the status breakdown — if picking
   * "Paid" emptied the Overdue card, the cards would just restate the filter
   * back at you. So the client filter narrows the book; the status filter only
   * narrows the table.
   */
  const inScope = useMemo(
    () => (clientFilter ? invoices.filter((i) => i.client_id === clientFilter) : invoices),
    [invoices, clientFilter]
  );

  const visible = useMemo(
    () =>
      status === "all"
        ? inScope
        : inScope.filter((i) => effectiveInvoiceStatus(i) === status),
    [inScope, status]
  );

  /**
   * Amounts convert into the base currency before summing. Adding ₹15,000 to
   * A$900 and printing the result is worse than printing nothing — it looks
   * like an answer.
   */
  const totals = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let paid = 0;
    let draft = 0;
    const aging: Record<Bucket, number> = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };

    for (const inv of inScope) {
      const amount = toBase(Number(inv.amount) || 0, inv.currency);
      const display = effectiveInvoiceStatus(inv);
      if (display === "paid") {
        paid += amount;
        continue;
      }
      if (display === "draft") {
        draft += amount;
        continue;
      }
      // Sent and overdue are both money owed to you.
      outstanding += amount;
      if (display === "overdue") overdue += amount;
      aging[bucketOf(inv)] += amount;
    }
    return { outstanding, overdue, paid, draft, aging };
  }, [inScope, toBase]);

  async function updateInvoice(id: string, patch: Partial<Invoice>) {
    const before = invoices;
    setRows((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) {
      setRows(before); // put the row back rather than leave a lie on screen
      toast.error("Couldn't update that invoice.");
    }
  }

  async function openDocument(inv: Invoice) {
    if (inv.storage_path) {
      const ok = await openStoredFile(inv.storage_path);
      if (!ok) toast.error("Couldn't open that file. It may have been removed.");
      return;
    }
    if (inv.document_url) window.open(inv.document_url, "_blank", "noopener,noreferrer");
  }

  const columns: Column<Invoice>[] = [
    {
      header: "Status",
      icon: CircleDot,
      width: "132px",
      sortKey: (i) => effectiveInvoiceStatus(i),
      render: (i) => {
        const display = effectiveInvoiceStatus(i);
        return <Badge tone={INVOICE_TONES[display]}>{INVOICE_STATUS_LABELS[display]}</Badge>;
      },
    },
    {
      header: "Invoice",
      icon: Hash,
      sortKey: (i) => i.number,
      render: (i) => (
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate font-medium">{i.number}</span>
          {(i.storage_path || i.document_url) && (
            <button
              type="button"
              aria-label={`Open ${i.number}`}
              onClick={(e) => {
                e.stopPropagation();
                openDocument(i);
              }}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              {i.storage_path ? (
                <Paperclip className="h-3 w-3" />
              ) : (
                <ExternalLink className="h-3 w-3" />
              )}
            </button>
          )}
        </span>
      ),
    },
    {
      header: "Client",
      icon: Building2,
      width: "200px",
      sortKey: (i) => companyOf(i.client_id),
      render: (i) => <span className="truncate">{companyOf(i.client_id)}</span>,
    },
    {
      header: "Amount",
      icon: Wallet,
      width: "140px",
      className: "text-right tabular-nums",
      // Sort on the base-converted value, so a mixed-currency list orders by
      // what it's actually worth rather than by the raw number.
      sortKey: (i) => toBase(Number(i.amount) || 0, i.currency),
      render: (i) => format(Number(i.amount) || 0, i.currency),
    },
    {
      header: "Due",
      icon: CalendarDays,
      width: "170px",
      sortKey: (i) => i.due_date ?? null,
      render: (i) => {
        const late = daysOverdue(i);
        return (
          <span className={cn("flex items-center gap-1.5", late != null && "text-danger")}>
            {formatDate(i.due_date)}
            {late != null && (
              <span className="text-[11px] text-danger/80">
                {late}d late
              </span>
            )}
          </span>
        );
      },
    },
    {
      header: "Set status",
      width: "124px",
      render: (i) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            value={i.status}
            options={INVOICE_STATUSES.map((s) => ({
              value: s,
              label: INVOICE_STATUS_LABELS[s],
            }))}
            onChange={(v) => updateInvoice(i.id, { status: v as InvoiceStatus })}
          />
        </div>
      ),
    },
  ];

  if (loading) return <TableSkeleton rows={8} />;

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All statuses" },
    { value: "overdue", label: "Overdue" },
    { value: "sent", label: "Sent" },
    { value: "draft", label: "Draft" },
    { value: "paid", label: "Paid" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Outstanding"
          value={format(totals.outstanding, base)}
          hint="Sent and overdue"
        />
        <SummaryCard
          label="Overdue"
          value={format(totals.overdue, base)}
          hint={totals.overdue > 0 ? "Past the due date" : "Nothing late"}
          tone={totals.overdue > 0 ? "danger" : undefined}
        />
        <SummaryCard label="Draft" value={format(totals.draft, base)} hint="Not sent yet" />
        <SummaryCard label="Paid" value={format(totals.paid, base)} hint="All time" />
      </div>

      {/* Aging. Only worth the space once something is actually late. */}
      {totals.overdue > 0 && (
        <Card>
          <p className="mb-2 text-[12px] font-medium text-foreground-secondary">
            Aging
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => (
              <div key={b}>
                <p className="text-[11px] text-muted-foreground">{BUCKET_LABELS[b]}</p>
                <p
                  className={cn(
                    "text-[15px] font-semibold tabular-nums",
                    b !== "current" && totals.aging[b] > 0 && "text-danger"
                  )}
                >
                  {format(totals.aging[b], base)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <Dropdown
            value={status}
            options={statusOptions}
            onChange={(v) => setStatus(v as StatusFilter)}
          />
        </div>
        <div className="w-52">
          <Dropdown
            value={clientFilter}
            options={[
              { value: "", label: "All clients" },
              ...clients.map((c) => ({ value: c.id, label: c.company })),
            ]}
            onChange={setClientFilter}
          />
        </div>
        <div className="ml-auto w-32">
          <Dropdown
            value={currency}
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            onChange={(v) => setCurrency(v as (typeof CURRENCIES)[number]["code"])}
          />
        </div>
      </div>

      {!converted && (
        <p className="text-[11px] text-muted-2">
          No exchange rate for {currency} yet — amounts show in their own currency.
        </p>
      )}

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Invoices are raised from a client's portal panel. They'll collect here once they exist."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(i) => i.id}
          pageSize={15}
          minWidth="900px"
          emptyMessage="No invoices match the current filters."
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[19px] font-semibold tabular-nums",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-2">{hint}</p>}
    </Card>
  );
}
