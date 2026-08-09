"use client";

import { useMemo } from "react";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  FileDown,
  Handshake,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wallet,
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
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge, statusTone } from "@/components/ui/Badge";
import { heatInRange, heatOf } from "@/lib/heat";
import {
  collectedFraction,
  currentStepIndex,
  isClosed,
  pipelineProgress,
  stepsFor,
} from "@/lib/dealStages";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Client, CurrencyCode, Deal, DealStage } from "@/lib/types";

/**
 * Pipeline, as list-detail. Second surface on RecordShell.
 *
 * This is the one the stepper was built for. On Clients it displays a status;
 * here the stages are a real process a deal moves through, and the stepper is
 * how you move it — `onSelect` writes back rather than just rendering.
 *
 * Same rule as Clients: added as an extra view, not a replacement. The table
 * and board keep their filters, saved views and drag-to-restage.
 */

export function DealFocusView({
  deals,
  clients,
  formatCurrency,
  toBase,
  ownerName,
  onStageChange,
  onOpenClient,
}: {
  deals: Deal[];
  clients: Client[];
  formatCurrency: (value: number, ccy: CurrencyCode) => string;
  /* Same lesson as Clients: account_owner is a profile ID, and rendering it
     raw puts a UUID where a person's name belongs. Passed in rather than
     looked up again here so there is one resolver, not two that can drift. */
  ownerName: (id: string | null) => string;
  /** Converts to the user's base currency, for cross-currency comparison. */
  toBase: (value: number, from: CurrencyCode) => number;
  onStageChange?: (deal: Deal, stage: DealStage) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const { selectedId, select, close } = useRecordSelection();

  const clientName = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.company]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Unknown client") : "No client");
  }, [clients]);

  /*
    Heat here is deal VALUE, normalised across what's on screen — the first
    real use of heatInRange. Deal amounts have no natural ceiling, so a fixed
    0..100 scale is meaningless; the biggest deal in the current filter is the
    hot one, whatever its absolute size.

    Converted to base first. Without that a 900 AUD deal reads colder than a
    ₹20,000 one while being worth more — the same bug the table's sortKey
    already guards against.
  */
  const scored = useMemo(() => {
    const base = deals.map((d) => toBase(Number(d.deal_value) || 0, d.currency));
    const min = base.length ? Math.min(...base) : 0;
    const max = base.length ? Math.max(...base) : 0;

    return deals.map((d, i) => ({
      deal: d,
      baseValue: base[i],
      heat: heatInRange(base[i], min, max),
      bucket: isClosed(d.deal_stage) ? "Closed" : d.deal_stage,
    }));
  }, [deals, toBase]);

  const selected = useMemo(
    () => scored.find((s) => s.deal.id === selectedId) ?? null,
    [scored, selectedId]
  );

  return (
    <RecordShell
      hasSelection={!!selected}
      onBack={close}
      list={
        <>
          <QueueHeader title="Deals" count={deals.length} />
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {scored.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={Handshake}
                  title="No deals"
                  description="Nothing matches the current filters."
                />
              </div>
            )}

            {scored.map(({ deal, heat, bucket }, i) => {
              const newBucket = i === 0 || scored[i - 1].bucket !== bucket;
              const closed = isClosed(deal.deal_stage);
              return (
                <div key={deal.id}>
                  {newBucket && <QueueDivider label={bucket} />}
                  <QueueItem
                    selected={deal.id === selectedId}
                    heatBackground={`var(--heat-${heat})`}
                    onClick={() => select(deal.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">
                          {deal.deal_name}
                        </div>
                        <div className="truncate text-[13px] text-muted-foreground">
                          {clientName(deal.client_id)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={statusTone(deal.deal_stage)}>{deal.deal_stage}</Badge>
                          {deal.close_date && (
                            <span className="truncate text-[11px] text-muted-2">
                              {formatDate(deal.close_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            // A lost deal's value is not money you have or are
                            // going to get. Striking it stops the queue reading
                            // as a total.
                            deal.deal_stage === "Closed Lost" &&
                              "text-muted-2 line-through"
                          )}
                        >
                          {formatCurrency(Number(deal.deal_value), deal.currency)}
                        </div>
                        {!closed && (
                          <HeatChip
                            step={heatOf(pipelineProgress(deal.deal_stage) * 100)}
                            label={`${Math.round(pipelineProgress(deal.deal_stage) * 100)}%`}
                            className="mt-1.5"
                          />
                        )}
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
            icon={Handshake}
            title="Select a deal"
            description="Pick one from the list to see it and move it through the pipeline."
          />
        </div>
      }
      detail={
        selected && (
          <DealRecord
            deal={selected.deal}
            clientName={clientName(selected.deal.client_id)}
            formatCurrency={formatCurrency}
            ownerName={ownerName}
            onStageChange={onStageChange}
            onOpenClient={onOpenClient}
          />
        )
      }
    />
  );
}

function DealRecord({
  deal,
  clientName,
  formatCurrency,
  ownerName,
  onStageChange,
  onOpenClient,
}: {
  deal: Deal;
  clientName: string;
  formatCurrency: (value: number, ccy: CurrencyCode) => string;
  ownerName: (id: string | null) => string;
  onStageChange?: (deal: Deal, stage: DealStage) => void;
  onOpenClient?: (clientId: string) => void;
}) {
  const value = Number(deal.deal_value) || 0;
  const paid = Number(deal.paid) || 0;
  const collected = collectedFraction(paid, value);

  const stages: Stage[] = stepsFor(deal.deal_stage).map((s) => ({
    id: s.id,
    label: s.label,
    tone: s.tone,
  }));
  // stepsFor collapses both closed states onto the terminal step, so the
  // stepper's own findIndex would miss a lost deal entirely — its id isn't in
  // the array it renders. The index comes from the same module instead.
  const currentId = stages[currentStepIndex(deal.deal_stage)]?.id ?? deal.deal_stage;

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
              {deal.deal_name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(deal.deal_stage)}>{deal.deal_stage}</Badge>
              <button
                onClick={
                  onOpenClient && deal.client_id
                    ? () => onOpenClient(deal.client_id)
                    : undefined
                }
                disabled={!onOpenClient || !deal.client_id}
                className="inline-flex items-center gap-1 rounded-full px-1 text-[13px] text-foreground-secondary transition-colors hover:text-foreground disabled:pointer-events-none"
              >
                <Building2 className="h-3.5 w-3.5" />
                {clientName}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:ml-auto">
            <MetaPair label="Value">
              {formatCurrency(value, deal.currency)}
            </MetaPair>
            <MetaPair label="Collected">
              <span className="inline-flex items-center gap-2">
                {formatCurrency(paid, deal.currency)}
                <HeatChip
                  step={heatOf(collected * 100)}
                  label={`${Math.round(collected * 100)}%`}
                />
              </span>
            </MetaPair>
            <MetaPair label="Close date">{formatDate(deal.close_date)}</MetaPair>
          </div>
        </div>
      }
      stage={
        <StageStepper
          stages={stages}
          currentId={currentId}
          // Writes back. This is the difference from Clients, where the stepper
          // only reports. Closed deals lock: reopening one is a decision with
          // consequences elsewhere (projects, invoices) and shouldn't happen
          // from a progress bar.
          onSelect={
            onStageChange && !isClosed(deal.deal_stage)
              ? (id) => onStageChange(deal, id as DealStage)
              : undefined
          }
        />
      }
      tabs={
        <>
          <PaneTab active>Summary</PaneTab>
          <PaneTab active={false}>Invoices</PaneTab>
          <PaneTab active={false}>Projects</PaneTab>
          <PaneTab active={false}>Activity</PaneTab>
        </>
      }
    >
      <PanelGrid>
        <WashCard strong>
          <PanelHeader title="Money" />
          <dl className="space-y-3">
            <MoneyRow label="Deal value" value={formatCurrency(value, deal.currency)} />
            <MoneyRow label="Collected" value={formatCurrency(paid, deal.currency)} />
            <MoneyRow
              label="Outstanding"
              value={formatCurrency(Math.max(0, value - paid), deal.currency)}
              emphasise={value - paid > 0}
            />
          </dl>
          {/* Track uses --wash-line rather than a white-alpha fill: on a wash
              card a white track is invisible, which is the same mistake the
              secondary button shipped with. */}
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--wash-line)]">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${collected * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            {Math.round(collected * 100)}% collected
            {value <= 0 && " — no deal value set yet"}
          </p>
        </WashCard>

        <WashCard>
          <PanelHeader
            title="Client"
            actions={
              onOpenClient &&
              deal.client_id && (
                <RoundButton
                  title="Open client"
                  onClick={() => onOpenClient(deal.client_id)}
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
            <MoneyRow label="Owner" value={ownerName(deal.account_owner)} />
            <MoneyRow label="Currency" value={deal.currency} />
          </dl>
        </WashCard>

        <WashCard>
          <PanelHeader title="Timeline" />
          <ul className="space-y-3">
            <TimelineRow
              icon={Plus}
              label="Created"
              value={formatDate(deal.created_at)}
            />
            <TimelineRow
              icon={RefreshCw}
              label="Last updated"
              value={formatDate(deal.updated_at)}
            />
            <TimelineRow
              icon={CalendarDays}
              label={isClosed(deal.deal_stage) ? "Closed" : "Expected close"}
              value={formatDate(deal.close_date)}
            />
            <TimelineRow
              icon={Wallet}
              label="Pipeline progress"
              value={
                deal.deal_stage === "Closed Lost"
                  ? "Lost"
                  : `${Math.round(pipelineProgress(deal.deal_stage) * 100)}%`
              }
            />
          </ul>
        </WashCard>
      </PanelGrid>
    </RecordPane>
  );
}

function MoneyRow({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-[13px] font-medium tabular-nums",
          emphasise && "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function TimelineRow({
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
