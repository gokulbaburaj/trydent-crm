"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Check,
  ExternalLink,
  FileDown,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Save,
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
import { GhostPill, HeatChip, InkButton, WashCard } from "@/components/ui/Wash";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, statusTone } from "@/components/ui/Badge";
import { heatOf } from "@/lib/heat";
import {
  STAGE_ORDER,
  bucketOf,
  clientScore,
  warmthLabel,
} from "@/lib/clientScore";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CLIENT_STATUSES, type Client, type ClientStatus } from "@/lib/types";

/**
 * Clients, as list-detail. The first surface converted to RecordShell.
 *
 * Shipped as a THIRD view alongside Table and Kanban rather than as a
 * replacement, on purpose. The table has filters, saved views, bulk actions
 * and multi-select built on top of it; swapping it out in the same change that
 * introduces the layout would mean any regression could be either the new
 * shell or the lost machinery, with no way to tell which. Same rule as the
 * calendar-packing extraction — don't fix and replace in one move.
 *
 * Once this has been used in anger and the gaps are known, the table can go.
 */

/**
 * Shortened for the stepper only. "Active Customer" and "Inactive Customer"
 * are the stored values and must not change here — this is a display label,
 * and the two words that differ are the only ones carrying meaning inside a
 * pill that's already 90px wide.
 */
const STAGE_LABELS: Record<ClientStatus, string> = {
  Lead: "Lead",
  Prospect: "Prospect",
  "Active Customer": "Active",
  "Inactive Customer": "Inactive",
};

/*
  Built from CLIENT_STATUSES, not from STAGE_ORDER directly, so that adding a
  status to the shared list without adding it here fails loudly at build time
  rather than quietly dropping a stage out of the stepper.
*/
const STAGES: Stage[] = STAGE_ORDER.filter((s) => CLIENT_STATUSES.includes(s)).map(
  (s) => ({ id: s, label: STAGE_LABELS[s] })
);

/**
 * `clients.account_owner` stores a profile ID, not a name.
 *
 * The table resolves it through the page's `ownerName` before rendering; this
 * view didn't, and shipped a raw UUID into the identity band where a person's
 * name belongs. Taking the resolver as a prop rather than fetching profiles
 * again here keeps one lookup on the page — two would drift the moment someone
 * is renamed.
 */
export function ClientFocusView({
  clients,
  ownerName = (id) => id ?? "Unassigned",
  onOpenFull,
}: {
  clients: Client[];
  ownerName?: (id: string | null) => string;
  onOpenFull?: (id: string) => void;
}) {
  const { selectedId, select, close } = useRecordSelection();

  /*
    "Now" is pinned once per mount, in a lazy initialiser.

    Reading Date.now() inside the useMemo trips react-hooks/purity, and the
    rule is right rather than pedantic: `now` feeds both the heat score and the
    time bucket, so an unstable clock means a client can drift between "This
    week" and "This month" on an unrelated re-render, moving under the cursor.

    Cost: buckets go stale if a tab is left open across midnight. That is the
    correct trade — a wrong-by-one-day label is invisible, whereas a row that
    jumps while you're reaching for it is not.
  */
  const [now] = useState(() => Date.now());

  const scored = useMemo(() => {
    return clients.map((c) => ({
      client: c,
      score: clientScore(c, now),
      bucket: bucketOf(c.last_contact, now),
    }));
  }, [clients, now]);

  const selected = useMemo(
    () => scored.find((s) => s.client.id === selectedId) ?? null,
    [scored, selectedId]
  );

  return (
    <RecordShell
      hasSelection={!!selected}
      onBack={close}
      list={
        <>
          <QueueHeader title="Clients" count={clients.length}>
            <RoundButton title="Refresh" className="border-border bg-transparent">
              <RefreshCw className="h-4 w-4" />
            </RoundButton>
          </QueueHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {scored.length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={Building2}
                  title="No clients yet"
                  description="Add one to see it here."
                />
              </div>
            )}

            {scored.map(({ client, score, bucket }, i) => {
              const step = heatOf(score);
              const newBucket = i === 0 || scored[i - 1].bucket !== bucket;
              return (
                <div key={client.id}>
                  {newBucket && <QueueDivider label={bucket} />}
                  <QueueItem
                    selected={client.id === selectedId}
                    heatBackground={`var(--heat-${step})`}
                    onClick={() => select(client.id)}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar name={client.company} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">
                          {client.company}
                        </div>
                        <div className="truncate text-[13px] text-muted-foreground">
                          {client.point_person ?? "No contact person"}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={statusTone(client.status)}>{client.status}</Badge>
                          <span className="truncate text-[11px] text-muted-2">
                            {formatDate(client.last_contact)}
                          </span>
                        </div>
                      </div>
                      {/* Ink-on-lime is unreadable, so on a selected row the
                          chip and the row background are the same colour — the
                          chip would vanish. It's redundant there anyway: the
                          whole row already IS the score. */}
                      {client.id !== selectedId && (
                        <HeatChip value={score} className="mt-0.5 shrink-0" />
                      )}
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
            icon={Building2}
            title="Select a client"
            description="Pick one from the list to see everything about them here."
          />
        </div>
      }
      detail={
        selected && (
          <ClientRecord
            client={selected.client}
            score={selected.score}
            ownerName={ownerName}
            onOpenFull={onOpenFull}
          />
        )
      }
    />
  );
}

function ClientRecord({
  client,
  score,
  ownerName,
  onOpenFull,
}: {
  client: Client;
  score: number;
  ownerName: (id: string | null) => string;
  onOpenFull?: (id: string) => void;
}) {
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
          <Avatar name={client.company} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold leading-tight tracking-tight">
              {client.company}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(client.status)}>{client.status}</Badge>
              {client.lead_source && <Badge tone="gray">{client.lead_source}</Badge>}
            </div>
          </div>

          {/* Pushed right on wide screens, wrapped below on narrow. The
              reference puts these at the far edge; at 1024px that would
              squeeze the name to three characters. */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:ml-auto">
            <MetaPair label="Lead source">{client.lead_source ?? "—"}</MetaPair>
            <MetaPair label="Rating">
              <span className="inline-flex items-center gap-2">
                {warmthLabel(score)}
                <HeatChip value={score} />
              </span>
            </MetaPair>
            <MetaPair label="Owner">{ownerName(client.account_owner)}</MetaPair>
          </div>
        </div>
      }
      stage={<StageStepper stages={STAGES} currentId={client.status} />}
      tabs={
        <>
          <PaneTab active>Summary</PaneTab>
          <PaneTab active={false}>Deals</PaneTab>
          <PaneTab active={false}>Invoices</PaneTab>
          <PaneTab active={false}>Activity</PaneTab>
        </>
      }
    >
      <PanelGrid>
        <WashCard strong>
          <PanelHeader title="Contact" />
          <dl className="space-y-3">
            <ContactRow icon={Mail} label="Email" value={client.email} href={
              client.email ? `mailto:${client.email}` : undefined
            } />
            <ContactRow icon={Phone} label="Phone" value={client.phone} href={
              client.phone ? `tel:${client.phone}` : undefined
            } />
            <ContactRow icon={Building2} label="Point person" value={client.point_person} />
            <ContactRow icon={MapPin} label="Address" value={client.address} />
          </dl>
        </WashCard>

        <WashCard>
          <PanelHeader
            title="Up next"
            actions={
              <RoundButton title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </RoundButton>
            }
          />
          <div className="rounded-[calc(var(--radius)-0.5rem)] bg-[var(--wash-card-strong)] p-3">
            <div className="text-[13px] font-semibold">Follow up</div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {client.last_contact
                ? `Last spoke ${formatDate(client.last_contact)}.`
                : "Nobody has logged contact with this client yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <InkButton>
                <Phone className="h-4 w-4" />
                Call
              </InkButton>
              <GhostPill>Mark complete</GhostPill>
            </div>
          </div>
        </WashCard>

        <WashCard>
          <PanelHeader
            title="Health"
            actions={
              onOpenFull && (
                <RoundButton title="Open full record" onClick={() => onOpenFull(client.id)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </RoundButton>
              )
            }
          />
          <div className="flex items-center gap-4">
            <HeatChip value={score} className="h-14 w-14 rounded-full text-[20px]" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">
                {warmthLabel(score)}
              </div>
              {/* Says what it's made of. A number with no derivation invites
                  people to treat it as a measurement rather than a heuristic. */}
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                From pipeline stage and contact recency, not a stored field.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5">
            <HealthPoint ok={client.status !== "Inactive Customer"}>
              Stage is {client.status}
            </HealthPoint>
            <HealthPoint ok={!!client.last_contact}>
              {client.last_contact
                ? `Contacted ${formatDate(client.last_contact)}`
                : "No contact logged"}
            </HealthPoint>
            <HealthPoint ok={!!client.account_owner}>
              {client.account_owner
                ? `Owned by ${ownerName(client.account_owner)}`
                : "No owner assigned"}
            </HealthPoint>
          </ul>
        </WashCard>
      </PanelGrid>
    </RecordPane>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
        <dd className="truncate text-[13px] font-medium">
          {value ? (
            href ? (
              <a href={href} className="hover:underline">
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-muted-2">—</span>
          )}
        </dd>
      </div>
    </div>
  );
}

function HealthPoint({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-snug">
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-primary text-primary-foreground" : "bg-[var(--surface)] text-muted-2"
        )}
      >
        {ok ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
      </span>
      <span className={ok ? "text-foreground-secondary" : "text-muted-foreground"}>
        {children}
      </span>
    </li>
  );
}
