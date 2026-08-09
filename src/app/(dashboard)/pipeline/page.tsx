"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Handshake,
  IndianRupee,
  LayoutGrid,
  List,
  Columns2,
  Plus,
} from "lucide-react";
import { FilterBar } from "@/components/FilterBar";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES_SWATCHES, seriesFill } from "@/lib/chartSeries";
import { Bar } from "@/components/charts/bar";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "@/components/KanbanBoard";
import { DataTable, type Column } from "@/components/DataTable";
import { StatusPicker } from "@/components/ui/StatusPicker";
import { useViewPreference } from "@/lib/useViewPreference";
import { DealFocusView } from "@/components/DealFocusView";
import { Button } from "@/components/ui/Button";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Popover, MenuItem, MenuLabel } from "@/components/ui/Popover";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import { useTabs } from "@/lib/tabs";
import { useIsPhone } from "@/lib/useMediaQuery";
import { applyFilters, useStoredFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { format } from "date-fns";
import { toast } from "@/components/Toaster";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import type { CurrencyCode, Deal, Client, Project } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";

/** Stage colours — one hue stepped down, because stages are a progression. */
const STAGE_COLORS = SERIES_SWATCHES;

/*
  No funnel option on purpose. FunnelChart scales every segment against the
  FIRST value, so the moment a later stage holds more deals than an earlier one
  (e.g. Closed Won 3 vs Proposal 1) it renders at 3x the container height and
  floods the page. Forcing it would mean sorting stages descending, which
  destroys pipeline order. A real funnel needs stage-transition history.
*/
type StageChart = "bar" | "value" | "share";

const STAGE_CHARTS: { id: StageChart; label: string; hint: string }[] = [
  { id: "bar", label: "Count", hint: "How many deals sit in each stage" },
  { id: "value", label: "Value", hint: "How much money sits in each stage" },
  { id: "share", label: "Share", hint: "Each stage's share of all deals" },
];

const emptyForm: Partial<Deal> = {
  deal_name: "",
  client_id: "",
  deal_stage: "Lead",
  deal_value: 0,
  paid: 0,
  close_date: null,
};

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
  value: c.code,
  label: `${c.symbol} ${c.code} — ${c.label}`,
}));

export default function PipelinePage() {
  const { rows: deals, setRows } = useSupabaseTable<Deal>(
    "deals",
    { column: "created_at", ascending: false }
  );
  const { rows: clients } = useSupabaseTable<Client>("clients");
  const { rows: profiles } = useStaffProfiles();

  const { rows: projects, setRows: setProjects } = useSupabaseTable<Project>("projects");
  const { openInNewTab } = useTabs();
  const isPhone = useIsPhone();

  const [stageChart, setStageChart] = useState<StageChart>("share");
  /** The deal just dragged into Closed Won, awaiting a decision. */
  const [wonDeal, setWonDeal] = useState<Deal | null>(null);
  const [projName, setProjName] = useState("");
  const [projStart, setProjStart] = useState<string | null>(null);
  const [projDue, setProjDue] = useState<string | null>(null);
  const [projBusy, setProjBusy] = useState(false);
  const [selected, setSelected] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<Partial<Deal> | null>(null);
  const [saving, setSaving] = useState(false);
  const { currency, setCurrency, base, toBase, format: formatCurrency } = useCurrency();

  /** A deal's own currency (older rows may predate the column). */
  // Stable, so the sums below can list it and recompute when rates land.
  const dealCcy = useCallback(
    (d: Deal): CurrencyCode => (d.currency as CurrencyCode) ?? base,
    [base]
  );

  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? "Unknown";
  const ownerName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? "Unassigned";

  const { filters, views, setFilters, setViews } = useStoredFilters("pipeline");
  /** Table columns. Ordered by what you scan for: what, who, how much, when. */
  const dealColumns: Column<Deal>[] = useMemo(
    () => [
      {
        header: "Deal",
        icon: Handshake,
        /* Sized, not left to absorb the remainder. Unsized it took every pixel
           the other columns didn't want, so a table of short deal names sat in
           a field of white space while the money columns were cramped. A long
           name clips to an ellipsis instead — the full name is one click away
           in the drawer, and the columns you scan are worth more width. */
        width: "24%",
        sortKey: (d) => d.deal_name,
        render: (d) => (
          <span className="font-medium" title={d.deal_name}>
            {d.deal_name}
          </span>
        ),
      },
      {
        header: "Client",
        icon: Building2,
        width: "22%",
        sortKey: (d) => clientName(d.client_id),
        render: (d) => <span className="text-muted-foreground">{clientName(d.client_id)}</span>,
      },
      {
        header: "Stage",
        icon: CircleDot,
        width: "170px",
        sortKey: (d) => DEAL_STAGES.indexOf(d.deal_stage),
        // Editable in place. Opening a drawer to change one enum is the kind
        // of friction that stops people keeping a pipeline current, and a
        // pipeline nobody updates is worse than no pipeline.
        render: (d) => (
          <span onClick={(e) => e.stopPropagation()}>
            <StatusPicker
              value={d.deal_stage}
              options={DEAL_STAGES}
              onChange={(stage) => handleStageMove(d, stage)}
              label="Change stage"
            />
          </span>
        ),
      },
      {
        header: "Value",
        icon: IndianRupee,
        width: "150px",
        className: "text-right tabular-nums",
        // Sorted on the base-converted number, not the raw figure — otherwise a
        // 900 AUD deal sorts below a ₹20,000 one while being worth more.
        sortKey: (d) => toBase(Number(d.deal_value), dealCcy(d)),
        render: (d) => formatCurrency(Number(d.deal_value), dealCcy(d)),
      },
      {
        header: "Paid",
        icon: IndianRupee,
        width: "150px",
        className: "text-right tabular-nums",
        sortKey: (d) => toBase(Number(d.paid), dealCcy(d)),
        render: (d) => {
          const paid = Number(d.paid);
          if (paid === 0) return <span className="text-muted-2">—</span>;
          const settled = paid >= Number(d.deal_value);
          return (
            <span className={settled ? "text-[var(--success-fg)]" : "text-[var(--warning-fg)]"}>
              {formatCurrency(paid, dealCcy(d))}
            </span>
          );
        },
      },
      {
        header: "Close date",
        icon: CalendarDays,
        width: "150px",
        sortKey: (d) => d.close_date ?? "",
        render: (d) => (
          <span className="text-muted-foreground">
            {d.close_date ? formatDate(d.close_date) : "—"}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clients, base, currency]
  );

  const [view, setView] = useViewPreference<"table" | "board" | "focus">("pipeline", "table");

  /**
   * How far back the chart looks.
   *
   * Without this the chart silently meant "everything ever", so a bar labelled
   * Closed Won counted deals from eighteen months ago alongside last week's.
   * A stage chart is only useful against a period — otherwise Closed Won grows
   * forever and never tells you anything.
   *
   * Deals with no close date are always included: an open deal hasn't got one
   * yet, and dropping them would empty the Lead and Qualified columns.
   */
  const [range, setRange] = useState<"week" | "month" | "year" | "all" | "custom">("year");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);

  const rangeStart = useMemo(() => {
    if (range === "all") return null;
    if (range === "custom") return customFrom;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (range === "week") d.setDate(d.getDate() - 7);
    if (range === "month") d.setMonth(d.getMonth() - 1);
    if (range === "year") d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, [range, customFrom]);

  const rangeEnd = range === "custom" ? customTo : null;

  const visibleDeals = useMemo(
    () =>
      applyFilters(deals, filters, {
        text: (d) => [
          d.deal_name,
          clients.find((c) => c.id === d.client_id)?.company,
        ],
        status: (d) => d.deal_stage,
        assignee: (d) => d.account_owner,
        due: (d) => d.close_date,
      }),
    [deals, filters, clients]
  );

  const chartDeals = useMemo(
    () =>
      visibleDeals.filter((d) => {
        if (!d.close_date) return true;
        if (rangeStart && d.close_date < rangeStart) return false;
        if (rangeEnd && d.close_date > rangeEnd) return false;
        return true;
      }),
    [visibleDeals, rangeStart, rangeEnd]
  );

  const stageBars = useMemo(
    () =>
      DEAL_STAGES.map((stage) => {
        const inStage = chartDeals.filter((d) => d.deal_stage === stage);
        return {
          stage,
          deals: inStage.length,
          value: inStage.reduce((sum, d) => sum + toBase(Number(d.deal_value), dealCcy(d)), 0),
        };
      }),
    [chartDeals, toBase, dealCcy]
  );

  /** Pie needs empty stages dropped, otherwise it renders zero-width slices. */
  const stageSlices = useMemo(
    () =>
      stageBars
        .map((s, i) => ({
          label: s.stage,
          value: s.deals,
          color: STAGE_COLORS[i % STAGE_COLORS.length],
        }))
        .filter((s) => s.value > 0),
    [stageBars]
  );


  /**
   * Deals sitting in each stage right now — exactly what the board shows.
   * We deliberately do NOT infer a funnel: without stage history there's no
   * way to know a deal ever passed through the stages it skipped, so any
   * "reached this stage" number would be a guess that contradicts the board.
   */
  // `value` is summed in the base currency (each deal converted from its own),
  // so mixed-currency stages add up correctly.
  async function handleStageMove(deal: Deal, stage: string) {
    setRows((prev) => prev.map((d) => (d.id === deal.id ? { ...d, deal_stage: stage as Deal["deal_stage"] } : d)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("deals").update({ deal_stage: stage }).eq("id", deal.id);

    // Winning a deal usually means work starts — but not always, and not
    // always as ONE project. So ask rather than auto-create, and only when
    // there's no project already pointing at this deal.
    if (stage === "Closed Won" && !projects.some((p) => p.deal_id === deal.id)) {
      setWonDeal(deal);
      setProjName(deal.deal_name);
      setProjStart(deal.close_date ?? format(new Date(), "yyyy-MM-dd"));
      setProjDue(null);
    }
  }

  async function createProjectFromDeal() {
    if (!wonDeal) return;
    const name = projName.trim();
    if (!name) return;
    setProjBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setProjBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert({
        name,
        client_id: wonDeal.client_id,
        // Linking here is what makes the budget wire itself up in Accounts.
        deal_id: wonDeal.id,
        owner: wonDeal.account_owner,
        member_ids: wonDeal.account_owner ? [wonDeal.account_owner] : [],
        status: "Planning",
        start_date: projStart,
        due_date: projDue,
      })
      .select()
      .single();
    setProjBusy(false);
    if (error || !data) {
      toast.error(`Couldn't create: ${error?.message ?? "unknown error"}`);
      return;
    }
    setProjects((prev) => [data as Project, ...prev]);
    setWonDeal(null);
    toast.success("Project created and linked to the deal");
    openInNewTab(`/projects/${(data as Project).id}`, name);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const supabase = createClient();
    if (!supabase) return;
    setSaving(true);

    const payload = {
      ...editing,
      deal_value: Number(editing.deal_value) || 0,
      paid: Number(editing.paid) || 0,
    };

    if (editing.id) {
      const { data, error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", editing.id)
        .select()
        .single();
      if (!error && data) {
        setRows((prev) => prev.map((d) => (d.id === data.id ? (data as Deal) : d)));
        if (selected?.id === data.id) setSelected(data as Deal);
      }
    } else {
      const { data, error } = await supabase.from("deals").insert(payload).select().single();
      if (!error && data) setRows((prev) => [data as Deal, ...prev]);
    }
    setSaving(false);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    if (!confirm("Delete this deal?")) return;
    await supabase.from("deals").delete().eq("id", id);
    setRows((prev) => prev.filter((d) => d.id !== id));
    setSelected(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm text-muted-foreground">
          {visibleDeals.length !== deals.length
            ? `${visibleDeals.length} of ${deals.length} deals shown`
            : `${deals.length} deal${deals.length !== 1 ? "s" : ""} in pipeline`}
        </h2>
        <div className="flex items-center gap-2">
          <Popover
            align="right"
            trigger={
              <button className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground-secondary hover:bg-hover hover:text-foreground">
                {CURRENCIES.find((c) => c.code === currency)?.symbol} {currency}
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Display currency</MenuLabel>
                {CURRENCIES.map((c) => (
                  <MenuItem
                    key={c.code}
                    selected={c.code === currency}
                    icon={<span className="text-[11px] text-muted-foreground">{c.symbol}</span>}
                    onClick={() => {
                      setCurrency(c.code);
                      close();
                    }}
                  >
                    {c.label}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
          <Button
            size="sm"
            onClick={() => setEditing({ ...emptyForm, client_id: clients[0]?.id ?? "", currency: base })}
          >
            <Plus className="h-4 w-4" /> New Deal
          </Button>

        </div>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        views={views}
        onViewsChange={setViews}
        statuses={DEAL_STAGES}
        statusLabel="Stage"
        assignees={profiles.map((p) => ({ value: p.id, label: p.full_name }))}
        showDue
        dueLabel="Close date"
        placeholder="Filter deals…"
        /* Next to Views rather than up in the page header: it's a control over
           this list, and it belongs with the other controls over this list. */
        trailing={
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            {([["table", "Table", List], ["board", "Board", LayoutGrid], ["focus", "Focus", Columns2]] as const).map(
              ([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  title={label}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                    view === id
                      ? "bg-active font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            )}
          </div>
        }
      />

      {/*
        Hidden in Focus. Not a layout workaround — the two things want opposite
        amounts of vertical space, and the chart wins by being first. It ate
        ~350px and pushed the entire list-detail shell below the fold, so the
        queue opened showing one and a half rows.

        The deeper point is that they answer different questions. The chart is
        an overview you read; Focus is a queue you work. Stacking a summary on
        top of a working surface is how a screen ends up doing neither well.
        Table and Board keep it.
      */}
      {deals.length > 0 && view !== "focus" && (
        <Card className="rounded-xl shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Deals by stage</h3>
              <p className="text-xs text-muted-foreground">
                {rangeStart
                  ? `Closed ${formatDate(rangeStart)}${rangeEnd ? ` – ${formatDate(rangeEnd)}` : " to today"}, plus everything still open.`
                  : "Every deal on record, plus everything still open."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
                {(
                  [
                    ["week", "7d"],
                    ["month", "1m"],
                    ["year", "1y"],
                    ["all", "All"],
                    ["custom", "Custom"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRange(id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      range === id
                        ? "bg-active text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {range === "custom" && (
                <div className="flex items-center gap-1.5">
                  <div className="w-[8.5rem]">
                    <DatePicker value={customFrom} onChange={setCustomFrom} />
                  </div>
                  <span className="text-xs text-muted-2">to</span>
                  <div className="w-[8.5rem]">
                    <DatePicker value={customTo} onChange={setCustomTo} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
              {STAGE_CHARTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setStageChart(c.id)}
                  title={c.hint}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    stageChart === c.id
                      ? "bg-active text-foreground"
                      : "text-muted-foreground hover:text-foreground-secondary"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {stageChart === "share" ? (
            <div className="flex flex-col items-center justify-center gap-5 py-4 sm:h-[260px] sm:flex-row sm:gap-8 sm:py-0">
              <PieChart
                data={stageSlices}
                size={isPhone ? 160 : 220}
                innerRadius={isPhone ? 46 : 62}
                padAngle={0.05}
                cornerRadius={6}
              >
                {stageSlices.map((s, i) => (
                  <PieSlice key={s.label} index={i} />
                ))}
                <PieCenter defaultLabel="deals" />
              </PieChart>
              <div className="flex flex-col gap-2">
                {stageSlices.map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                    <span className="tabular-nums text-foreground-secondary">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // aspectRatio is width-driven: on a ~1900px card anything taller
            // than ~6/1 turns into a wall of chart. On a 340px phone that same
            // ratio gives a 57px-tall plot — the bars vanish and only the
            // labels are left, which is exactly what the screenshot showed.
            <BarChart
              data={stageBars}
              xDataKey="stage"
              aspectRatio={isPhone ? "4 / 3" : "6 / 1"}
              barWidth={isPhone ? 22 : 30}
              margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
            >
              <Grid horizontal fadeHorizontal vertical={false} />
              <Bar
                dataKey={stageChart === "value" ? "value" : "deals"}
                fill={seriesFill(0)} lineCap="round"
              />
              {/* Five stage names don't fit across a phone. Let the axis thin
                  them out rather than printing them on top of each other. */}
              <BarXAxis showAllLabels={!isPhone} />
              <ChartTooltip
                content={({ point }) => (
                  <TooltipContent
                    title={String(point.stage)}
                    rows={[
                      {
                        color: "var(--chart-1)",
                        label: "Deals",
                        value: Number(point.deals),
                      },
                      {
                        color: "var(--chart-2)",
                        label: "Value",
                        value: formatCurrency(Number(point.value)),
                      },
                    ]}
                  />
                )}
              />
            </BarChart>
          )}
        </Card>
      )}

      {view === "focus" ? (
        /* Explicit height, same reason as Clients: the page above is a
           scrolling flex column, so h-full resolves against no fixed height
           and collapses the shell to zero. Taller allowance than Clients
           because the stage chart sits above this one. */
        <div className="h-[calc(100vh-15rem)] min-h-[26rem]">
          <DealFocusView
            deals={visibleDeals}
            clients={clients}
            toBase={toBase}
            ownerName={ownerName}
            onStageChange={handleStageMove}
            onOpenClient={(id) => openInNewTab(`/clients/${id}`)}
          />
        </div>
      ) : view === "table" ? (
        <DataTable
          rows={visibleDeals}
          columns={dealColumns}
          rowKey={(d) => d.id}
          onRowClick={(d) => setSelected(d)}
          // Lost deals stay in the list — you want to see what you didn't win —
          // but they shouldn't compete with live work for attention.
          isDimmed={(d) => d.deal_stage === "Closed Lost"}
          emptyMessage="No deals match these filters."
          pageSize={15}
        />
      ) : (
        <KanbanBoard
          columns={DEAL_STAGES.map((s) => ({ id: s, label: s }))}
          items={visibleDeals}
          getColumnId={(d) => d.deal_stage}
          onMove={handleStageMove}
          columnMeta={(_, items) =>
            items.length > 0 ? (
              <span className="text-xs font-medium tabular-nums text-[var(--success-fg)]">
                {formatCurrency(items.reduce((sum, d) => sum + toBase(Number(d.deal_value), dealCcy(d)), 0))}
              </span>
            ) : null
          }
          /*
           * Three stacked lines with the value on its own row made every card
           * tall and mostly empty, which is what made a board of 22 deals feel
           * like scrolling through padding. Name and value share a line now —
           * they're the two things you read — with the client underneath.
           */
          renderCard={(d) => (
            <div onClick={() => setSelected(d)} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] font-medium">{d.deal_name}</span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-primary">
                  {formatCurrency(Number(d.deal_value), dealCcy(d))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-2">
                <span className="min-w-0 truncate">{clientName(d.client_id)}</span>
                {Number(d.paid) > 0 && Number(d.paid) < Number(d.deal_value) && (
                  <span className="shrink-0 text-[var(--warning-fg)]">
                    {Math.round((Number(d.paid) / Number(d.deal_value)) * 100)}% paid
                  </span>
                )}
              </div>
            </div>
          )}
        />
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.deal_name ?? ""}>
        {selected && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Badge tone={statusTone(selected.deal_stage)} dot>
                {selected.deal_stage}
              </Badge>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(selected)}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(selected.id)}>
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Client" value={clientName(selected.client_id)} />
              <Info label="Owner" value={ownerName(selected.account_owner)} />
              <Info label="Deal Value" value={formatCurrency(Number(selected.deal_value), dealCcy(selected))} />
              <Info label="Paid" value={formatCurrency(Number(selected.paid), dealCcy(selected))} />
              <Info
                label="Remaining"
                value={formatCurrency(Number(selected.deal_value) - Number(selected.paid), dealCcy(selected))}
              />
              <Info label="Close Date" value={formatDate(selected.close_date)} />
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit Deal" : "New Deal"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div>
              <Label>Deal Name</Label>
              <Input
                required
                value={editing.deal_name ?? ""}
                onChange={(e) => setEditing({ ...editing, deal_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Client</Label>
              <Dropdown
                value={editing.client_id ?? ""}
                placeholder="Select client"
                options={clients.map((c) => ({ value: c.id, label: c.company }))}
                onChange={(v) => setEditing({ ...editing, client_id: v })}
              />
            </div>
            <div>
              <Label>Stage</Label>
              <Dropdown
                value={editing.deal_stage ?? "Lead"}
                options={DEAL_STAGES.map((s) => ({ value: s, label: s }))}
                onChange={(v) => setEditing({ ...editing, deal_stage: v as Deal["deal_stage"] })}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Dropdown
                value={editing.currency ?? base}
                options={CURRENCY_OPTIONS}
                onChange={(v) => setEditing({ ...editing, currency: v as CurrencyCode })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/*
                `|| ""`, not `?? 0`.

                A zero renders as the literal string "0", so the caret lands
                after it and every keystroke appends: 0 → 01 → 015000. Showing
                an empty field with a "0" placeholder means typing replaces
                rather than extends, and `Number("")` is 0 so clearing the box
                still stores zero. `accounts/page.tsx` already did this for
                budgets; it just never reached here.
              */}
              <div>
                <Label>Deal Value ({editing.currency ?? base})</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={editing.deal_value || ""}
                  onChange={(e) => setEditing({ ...editing, deal_value: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Paid ({editing.currency ?? base})</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={editing.paid || ""}
                  onChange={(e) => setEditing({ ...editing, paid: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Enter the amounts in the currency you&apos;re actually paid in. The pipeline
              converts to your display currency automatically.
            </p>
            <div>
              <Label>Close Date</Label>
              <DatePicker
                value={editing.close_date}
                onChange={(d) => setEditing({ ...editing, close_date: d })}
              />
            </div>
            <div>
              <Label>Owner</Label>
              <Dropdown
                value={editing.account_owner ?? ""}
                options={[
                  { value: "", label: "Unassigned" },
                  ...profiles.map((p) => ({ value: p.id, label: p.full_name })),
                ]}
                onChange={(v) => setEditing({ ...editing, account_owner: v || null })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* Deal won → start the work? */}
      <Drawer
        open={!!wonDeal}
        onClose={() => setWonDeal(null)}
        title="Deal won — start a project?"
      >
        {wonDeal && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createProjectFromDeal();
            }}
            className="flex flex-col gap-4"
          >
            <div className="rounded-lg border border-success/30 bg-success/10 p-3">
              <p className="text-[13px] font-medium text-[var(--success-fg)]">
                {wonDeal.deal_name} · {formatCurrency(Number(wonDeal.deal_value), dealCcy(wonDeal))}
              </p>
              <p className="mt-0.5 text-[11px] text-foreground-secondary">
                {clientName(wonDeal.client_id)}
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Creating a project links it to this deal, so the budget in Accounts follows the
              deal value automatically. Skip if this work is already running, or if the deal
              covers several projects you&apos;ll set up separately.
            </p>

            <div>
              <Label>Project name</Label>
              <Input value={projName} onChange={(e) => setProjName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Starts</Label>
                <DatePicker value={projStart} onChange={setProjStart} placeholder="Start" />
              </div>
              <div>
                <Label>Ends</Label>
                <DatePicker value={projDue} onChange={setProjDue} placeholder="Deadline" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1" disabled={projBusy || !projName.trim()}>
                {projBusy ? "Creating..." : "Create project"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setWonDeal(null)}>
                Not now
              </Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}
