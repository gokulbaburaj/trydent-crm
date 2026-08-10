"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ExternalLink,
  FileDown,
  FileText,
  MoreHorizontal,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Send,
  Trash2,
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
import { HeatChip, InkButton, WashCard } from "@/components/ui/Wash";
import { Money } from "@/components/ui/Money";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, statusTone } from "@/components/ui/Badge";
import { heatOf } from "@/lib/heat";
import {
  BUCKET_ORDER,
  ageingBucket,
  currentInvoiceStep,
  daysOverdue,
  daysUntilDue,
  invoiceSteps,
  urgency,
} from "@/lib/invoiceStage";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  INVOICE_STATUS_LABELS,
  effectiveInvoiceStatus,
  type Client,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/types";

/**
 * Invoices, as list-detail. Fourth surface on RecordShell.
 *
 * The one where the queue order carries the most meaning: an invoice list is a
 * worklist, and the only question it answers is "who owes me and how late are
 * they". So it sorts by urgency rather than by date or amount, and the heat
 * scale colours lateness rather than value — the amount is already printed on
 * every row, and a large invoice paid on time needs nothing from anyone.
 *
 * Same rule as the other three: an extra view, nothing removed.
 */

export function InvoiceFocusView({
  invoices,
  clients,
  onStatusChange,
  onOpenClient,
}: {
  invoices: Invoice[];
  clients: Client[];
  onStatusChange?: (invoice: Invoice, status: InvoiceStatus) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const { selectedId, select, close } = useRecordSelection();

  /*
    Pinned once per mount, same as the Clients view.

    Every derived value here depends on it — bucket, urgency, days overdue —
    so an unstable clock would let a row change group mid-render. Cost is that
    the buckets go stale if a tab is left open across midnight, which is
    invisible next to a row jumping under the cursor.
  */
  const [now] = useState(() => Date.now());

  const clientName = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.company]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Unknown client") : "No client");
  }, [clients]);

  const scored = useMemo(() => {
    const rows = invoices.map((inv) => ({
      invoice: inv,
      bucket: ageingBucket(inv, now),
      urgency: urgency(inv, now),
      overdueBy: daysOverdue(inv, now),
      dueIn: daysUntilDue(inv, now),
    }));

    /*
      Grouped by bucket in BUCKET_ORDER, then by urgency inside each.

      The divider only renders when a row's bucket differs from the one above,
      which is correct on a sorted list and nonsense otherwise — the Projects
      view shipped with exactly that bug this morning and showed one heading
      per row. Sorting here is what makes the dividers mean anything.
    */
    return rows.sort(
      (a, b) =>
        BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket) ||
        b.urgency - a.urgency ||
        (a.invoice.number ?? "").localeCompare(b.invoice.number ?? "")
    );
  }, [invoices, now]);

  const selected = useMemo(
    () => scored.find((s) => s.invoice.id === selectedId) ?? null,
    [scored, selectedId]
  );

  return (
    <RecordShell
      hasSelection={!!selected}
      recordKey={selected?.invoice.id}
      onBack={close}
      list={
        <>
          <QueueHeader title="Invoices" count={invoices.length} />
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {scored.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={Receipt}
                  title="No invoices"
                  description="Nothing matches the current filters."
                />
              </div>
            )}

            {scored.map(({ invoice, bucket, urgency: u, overdueBy, dueIn }, i) => {
              const newBucket = i === 0 || scored[i - 1].bucket !== bucket;
              const effective = effectiveInvoiceStatus(invoice);
              const paid = invoice.status === "paid";
              return (
                <div key={invoice.id}>
                  {newBucket && <QueueDivider label={bucket} />}
                  <QueueItem
                    selected={invoice.id === selectedId}
                    // Paid rows get no heat. They're settled, and colouring
                    // them competes with the ones that still need chasing.
                    heatBackground={paid ? undefined : `var(--heat-${heatOf(u)})`}
                    onClick={() => select(invoice.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">
                          {invoice.number || "Untitled"}
                        </div>
                        <div className="truncate text-[13px] text-muted-foreground">
                          {clientName(invoice.client_id)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={statusTone(effective)}>
                            {INVOICE_STATUS_LABELS[effective]}
                          </Badge>
                          {/* The number that actually drives the decision. */}
                          {overdueBy > 0 && (
                            <span className="truncate text-[11px] font-medium text-[var(--danger-fg)]">
                              {overdueBy}d late
                            </span>
                          )}
                          {overdueBy === 0 && dueIn > 0 && dueIn <= 7 && (
                            <span className="truncate text-[11px] text-muted-2">
                              due in {dueIn}d
                            </span>
                          )}
                          {overdueBy === 0 && dueIn === 0 && invoice.due_date && (
                            <span className="truncate text-[11px] text-muted-2">
                              {formatDate(invoice.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "shrink-0 text-right text-[13px] font-semibold tabular-nums",
                          paid && "text-muted-2"
                        )}
                      >
                        <Money
                          value={Number(invoice.amount)}
                          from={invoice.currency}
                          animate={false}
                        />
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
            icon={Receipt}
            title="Select an invoice"
            description="Pick one from the list to see it and move it along."
          />
        </div>
      }
      detail={
        selected && (
          <InvoiceRecord
            invoice={selected.invoice}
            clientName={clientName(selected.invoice.client_id)}
            overdueBy={selected.overdueBy}
            dueIn={selected.dueIn}
            urgency={selected.urgency}
            onStatusChange={onStatusChange}
            onOpenClient={onOpenClient}
          />
        )
      }
    />
  );
}

function InvoiceRecord({
  invoice,
  clientName,
  overdueBy,
  dueIn,
  urgency: u,
  onStatusChange,
  onOpenClient,
}: {
  invoice: Invoice;
  clientName: string;
  overdueBy: number;
  dueIn: number;
  urgency: number;
  onStatusChange?: (invoice: Invoice, status: InvoiceStatus) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const effective = effectiveInvoiceStatus(invoice);
  const steps = invoiceSteps(invoice);
  const stages: Stage[] = steps.map((s) => ({ id: s.id, label: s.label, tone: s.tone }));
  const currentId = stages[currentInvoiceStep(invoice.status)]?.id ?? invoice.status;

  return (
    <RecordPane
      toolbar={
        <>
          <ToolbarButton icon={Save}>Save</ToolbarButton>
          <ToolbarButton icon={Plus}>New</ToolbarButton>
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
              {invoice.number || "Untitled invoice"}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(effective)}>{INVOICE_STATUS_LABELS[effective]}</Badge>
              <button
                onClick={
                  onOpenClient && invoice.client_id
                    ? () => onOpenClient(invoice.client_id)
                    : undefined
                }
                disabled={!onOpenClient || !invoice.client_id}
                className="inline-flex items-center gap-1 rounded-full px-1 text-[13px] text-foreground-secondary transition-colors hover:text-foreground disabled:pointer-events-none"
              >
                <Building2 className="h-3.5 w-3.5" />
                {clientName}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:ml-auto">
            <MetaPair label="Amount">
              <Money value={Number(invoice.amount)} from={invoice.currency} />
            </MetaPair>
            <MetaPair label="Issued">{formatDate(invoice.issue_date)}</MetaPair>
            <MetaPair label={overdueBy > 0 ? "Overdue by" : "Due"}>
              {overdueBy > 0 ? (
                <span className="inline-flex items-center gap-2">
                  {overdueBy} {overdueBy === 1 ? "day" : "days"}
                  <HeatChip step={heatOf(u)} label={`${overdueBy}d`} />
                </span>
              ) : (
                formatDate(invoice.due_date)
              )}
            </MetaPair>
          </div>
        </div>
      }
      stage={
        <StageStepper
          stages={stages}
          currentId={currentId}
          /*
            Writable, like the pipeline stepper. Unlike a deal, an invoice can
            legitimately go BACKWARDS — marking one paid by mistake happens, and
            the fix shouldn't require the database. So every step stays
            reachable rather than only the next one.
          */
          onSelect={
            onStatusChange ? (id) => onStatusChange(invoice, id as InvoiceStatus) : undefined
          }
        />
      }
      tabs={
        <>
          <PaneTab active>Summary</PaneTab>
          <PaneTab active={false}>Document</PaneTab>
          <PaneTab active={false}>Activity</PaneTab>
        </>
      }
    >
      <PanelGrid>
        <WashCard strong>
          <PanelHeader title="Status" />
          {overdueBy > 0 ? (
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger-fg)]" />
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[var(--danger-fg)]">
                  {overdueBy} {overdueBy === 1 ? "day" : "days"} overdue
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  Sent {formatDate(invoice.issue_date)}, due{" "}
                  {formatDate(invoice.due_date)}.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-foreground-secondary">
              {invoice.status === "paid"
                ? "Settled — nothing outstanding."
                : invoice.status === "draft"
                  ? "Not sent yet."
                  : dueIn > 0
                    ? `Due in ${dueIn} ${dueIn === 1 ? "day" : "days"}.`
                    : "Sent. No due date set."}
            </p>
          )}

          {invoice.status !== "paid" && onStatusChange && (
            <div className="mt-4 flex flex-wrap gap-2">
              {invoice.status === "draft" ? (
                <InkButton onClick={() => onStatusChange(invoice, "sent")}>
                  <Send className="h-4 w-4" />
                  Mark sent
                </InkButton>
              ) : (
                <InkButton onClick={() => onStatusChange(invoice, "paid")}>
                  Mark paid
                </InkButton>
              )}
            </div>
          )}
        </WashCard>

        <WashCard>
          <PanelHeader
            title="Client"
            actions={
              onOpenClient &&
              invoice.client_id && (
                <RoundButton
                  title="Open client"
                  onClick={() => onOpenClient(invoice.client_id)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </RoundButton>
              )
            }
          />
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate text-[14px] font-medium">{clientName}</span>
          </div>
          <dl className="mt-3 space-y-3">
            <Row label="Currency" value={invoice.currency} />
            <Row label="Linked deal" value={invoice.deal_id ? "Yes" : "—"} />
          </dl>
        </WashCard>

        <WashCard>
          <PanelHeader title="Dates" />
          <ul className="space-y-3">
            <DateRow icon={FileText} label="Issued" value={formatDate(invoice.issue_date)} />
            <DateRow icon={CalendarDays} label="Due" value={formatDate(invoice.due_date)} />
            <DateRow icon={Plus} label="Created" value={formatDate(invoice.created_at)} />
          </ul>
          {invoice.notes && (
            <p className="mt-3 border-t border-[var(--wash-line)] pt-3 text-[12px] leading-snug text-muted-foreground">
              {invoice.notes}
            </p>
          )}
        </WashCard>
      </PanelGrid>
    </RecordPane>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[13px] font-medium">{value}</dd>
    </div>
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
