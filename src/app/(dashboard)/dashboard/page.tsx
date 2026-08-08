"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseISO, format as formatDateFns } from "date-fns";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { BarChart } from "@/components/charts/bar-chart";
import { SERIES_SWATCHES, seriesFill, seriesSwatch } from "@/lib/chartSeries";
import { Bar } from "@/components/charts/bar";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { LineChart, Line } from "@/components/charts/line-chart";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { TooltipContent } from "@/components/charts/tooltip/tooltip-content";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/useAuth";
import { DashboardSkeleton } from "@/components/ui/Skeletons";
import type { CurrencyCode, Deal, Client, Activity } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";

/*
  Deal stages are ordinal — Lead runs through to Closed Won — so a stepped ramp
  of one hue encodes the ordering that six unrelated colours threw away. See
  lib/chartSeries.
*/
const COLORS = SERIES_SWATCHES;

/** Chart shapes that actually suit a monthly revenue series. */
type RevenueChart = "bar" | "line" | "area";

/**
 * Ticks on a monthly series say "Jan 26", not "Jan 1".
 *
 * The chart's default formatter is "MMM d", which is right for a daily series
 * and actively misleading here — every point sits on the 1st, so twelve months
 * of revenue would label as "Jan 1, Feb 1, Mar 1" and read as three days.
 */
const monthTickFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});
const monthTick = (d: Date) => monthTickFmt.format(d);

const REVENUE_CHARTS: { id: RevenueChart; label: string; hint: string }[] = [
  { id: "bar", label: "Bar", hint: "Compare month totals" },
  { id: "line", label: "Line", hint: "Follow the trend month to month" },
  { id: "area", label: "Area", hint: "Trend with a sense of volume" },
];

export default function DashboardPage() {
  const { format: formatCurrency, toBase, base } = useCurrency();
  const [revenueChart, setRevenueChart] = useState<RevenueChart>("bar");
  const { profile } = useAuth();
  const { rows: deals, loading: dealsLoading } = useSupabaseTable<Deal>("deals");
  // Stable so the sums below can depend on it honestly. `toBase` changes
  // identity only when the rates or the base currency change, so this does too.
  const dealBase = useCallback(
    (d: Deal) => toBase(Number(d.deal_value), (d.currency as CurrencyCode) ?? base),
    [toBase, base]
  );
  const { rows: clients, loading: clientsLoading } = useSupabaseTable<Client>("clients");
  const { rows: activities, loading: activitiesLoading } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );

  // Deals can be in different currencies, so every sum is done in the base
  // currency (each deal converted from its own), then formatted to display.
  const totalPipeline = useMemo(
    () =>
      deals
        .filter((d) => d.deal_stage !== "Closed Won" && d.deal_stage !== "Closed Lost")
        .reduce((sum, d) => sum + dealBase(d), 0),
    [deals, dealBase]
  );

  const closedWonThisYear = useMemo(() => {
    const year = new Date().getFullYear();
    return deals
      .filter(
        (d) =>
          d.deal_stage === "Closed Won" &&
          d.close_date &&
          new Date(d.close_date).getFullYear() === year
      )
      .reduce((sum, d) => sum + dealBase(d), 0);
  }, [deals, dealBase]);

  const activeClients = clients.filter(
    (c) => c.status === "Active Customer"
  ).length;

  const openDeals = deals.filter(
    (d) => d.deal_stage !== "Closed Won" && d.deal_stage !== "Closed Lost"
  ).length;

  const wonThisYearCount = useMemo(() => {
    const year = new Date().getFullYear();
    return deals.filter(
      (d) =>
        d.deal_stage === "Closed Won" &&
        d.close_date &&
        new Date(d.close_date).getFullYear() === year
    ).length;
  }, [deals]);

  /** Headline figure only — a mean over an empty pipeline is zero, not NaN. */
  const avgDealSize = useMemo(() => {
    if (deals.length === 0) return 0;
    const total = deals.reduce((s, d) => s + dealBase(d), 0);
    return total / deals.length;
  }, [deals, dealBase]);

  // PieData shape: { label, value, color }
  const stageData = useMemo(
    () =>
      DEAL_STAGES.map((stage, i) => ({
        label: stage,
        value: deals.filter((d) => d.deal_stage === stage).length,
        color: COLORS[i % COLORS.length],
      })).filter((d) => d.value > 0),
    [deals]
  );

  /**
   * Closed-won revenue per month, in calendar order with no gaps.
   *
   * Two bugs lived here.
   *
   * 1. ORDER. The bucket key was the display label ("Aug 26"), and
   *    Object.entries returns insertion order — i.e. whatever order the deals
   *    happened to arrive in. On the bar chart that looked like nothing worse
   *    than shuffled months. On the line chart it drew an S: the x-axis is a
   *    real time scale, so each point sits at its true date while the line
   *    connects them in array order, and the stroke doubles back on itself.
   *    A chart that loops is a sorting bug every time. Bucketing on a sortable
   *    "YYYY-MM" key and formatting only at the end fixes both views.
   *
   * 2. GAPS. A month with no closed-won deals was simply absent, so the line
   *    ran straight from June to August as though July had been steady. For a
   *    revenue series an empty month is not missing data — it's zero, and
   *    saying so is the honest shape. Filled between the first and last month
   *    that actually have deals; we don't invent leading or trailing zeros.
   */
  const monthlyRevenue = useMemo(() => {
    const buckets = new Map<string, number>();
    deals
      .filter((d) => d.deal_stage === "Closed Won" && d.close_date)
      .forEach((d) => {
        const date = new Date(d.close_date as string);
        if (Number.isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, (buckets.get(key) ?? 0) + dealBase(d));
      });

    if (buckets.size === 0) return [];

    const keys = Array.from(buckets.keys()).sort();
    const [firstY, firstM] = keys[0].split("-").map(Number);
    const [lastY, lastM] = keys[keys.length - 1].split("-").map(Number);

    /*
     * Each row carries BOTH a label and a real Date, and they are not
     * interchangeable.
     *
     * `month` ("Jan 26") is for the bar chart, which uses a band scale and
     * treats x as a category. `date` is for the line and area charts, which
     * build a time scale and parse x with `new Date(...)`.
     *
     * Handing the label to a time scale is what produced two crossing lines on
     * this card: `new Date("Sep 25")` is not September 2025, it's the 25th of
     * September in the current year — the "25" is read as a day. So a series
     * spanning late 2025 into 2026 came out with the 2025 months sorted AFTER
     * the 2026 ones, and the path doubled back across the chart.
     */
    const out: { month: string; date: Date; revenue: number }[] = [];
    const cursor = new Date(firstY, firstM - 1, 1);
    const end = new Date(lastY, lastM - 1, 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      out.push({
        month: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        date: new Date(cursor),
        revenue: buckets.get(key) ?? 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }, [deals, dealBase]);

  /** Shared tooltip so bar and area read identically. */
  // TooltipContent is the vendored bklit panel: padded, titled, colour-dotted
  // rows with right-aligned values. Rendering raw <div>s here is what made the
  // old tooltips look cramped against their border.
  const revenueTooltip = ({ point }: { point: Record<string, unknown> }) => (
    <TooltipContent
      title={String(point.month)}
      rows={[
        {
          color: "var(--chart-1)",
          label: "Revenue",
          value: formatCurrency(Number(point.revenue)),
        },
      ]}
    />
  );

  const loading = dealsLoading || clientsLoading || activitiesLoading;

  const upcomingSchedule = useMemo(() => {
    const now = new Date();
    return activities
      .filter((a) => parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 6);
  }, [activities]);

  if (loading) return <DashboardSkeleton />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName =
    profile?.full_name?.split(/[@\s.]/)[0]?.replace(/^\w/, (c) => c.toUpperCase()) ?? "there";

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      {/*
        Hero band. Four headline numbers inside one tinted panel rather than
        four separate cards — the figures read as a single summary of the
        business, and the size difference makes them the first thing you see.
        Each carries a quieter second line so the number has context without
        needing another card.
      */}
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 60%), linear-gradient(180deg, oklch(1 0 0 / 0.05), transparent)",
          }}
        />
        <div className="relative p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {greeting}, {firstName}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <Link
              href="/pipeline"
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-hover px-2.5 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-active hover:text-foreground"
            >
              Open pipeline <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <HeroStat
              label="Total pipeline value"
              value={formatCurrency(totalPipeline)}
              subLabel="Open deals"
              subValue={String(openDeals)}
            />
            <HeroStat
              label="Closed won this year"
              value={formatCurrency(closedWonThisYear)}
              subLabel="Deals won"
              subValue={String(wonThisYearCount)}
            />
            <HeroStat
              label="Active clients"
              value={String(activeClients)}
              subLabel="All clients"
              subValue={String(clients.length)}
            />
            <HeroStat
              label="Average deal size"
              value={formatCurrency(avgDealSize)}
              subLabel="Across"
              subValue={`${deals.length} deals`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* h-full + flex so the donut centres in whatever height the row takes,
            instead of leaving a tall gap under a small chart. */}
        <Card className="flex h-full flex-col lg:col-span-1">
          <h3 className="text-sm font-semibold text-muted-foreground">Deals by Stage</h3>
          {stageData.length > 0 ? (
            <div className="flex min-h-[200px] flex-1 items-center justify-center py-2">
              <PieChart
                data={stageData}
                size={200}
                innerRadius={58}
                padAngle={0.05}
                cornerRadius={6}
              >
                {stageData.map((s, i) => (
                  <PieSlice key={s.label} index={i} />
                ))}
                <PieCenter defaultLabel="deals" />
              </PieChart>
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No deals yet.
            </p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {stageData.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Revenue by Month (Closed Won)
            </h3>
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface p-1">
              {REVENUE_CHARTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setRevenueChart(c.id)}
                  title={c.hint}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    revenueChart === c.id
                      ? "bg-active text-foreground"
                      : "text-muted-foreground hover:text-foreground-secondary"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {monthlyRevenue.length > 0 ? (
            revenueChart === "bar" ? (
              <BarChart
                data={monthlyRevenue}
                xDataKey="month"
                aspectRatio="5 / 2"
                barGap={0.28}
                // Fixed, not auto. Bandwidth is the card width divided by the
                // number of months, so four months rendered four slabs. bklit's
                // bars are narrow at every data count — the bar is a mark, not a
                // container, and the gaps are what make a series readable.
                barWidth={30}
                margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
              >
                <Grid horizontal fadeHorizontal vertical={false} />
                <Bar dataKey="revenue" fill={seriesFill(0)} lineCap="round" />
                <BarXAxis />
                <ChartTooltip content={revenueTooltip} />
              </BarChart>
            ) : revenueChart === "line" ? (
              <LineChart
                data={monthlyRevenue}
                /* Real Dates, not the label — see the note in monthlyRevenue. */
                xDataKey="date"
                labelFormat={monthTick}
                aspectRatio="5 / 2"
                margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
              >
                <Grid horizontal fadeHorizontal vertical={false} />
                <Line dataKey="revenue" stroke={seriesSwatch(0)} showMarkers />
                <XAxis />
                <ChartTooltip content={revenueTooltip} />
              </LineChart>
            ) : (
              <AreaChart
                data={monthlyRevenue}
                xDataKey="date"
                labelFormat={monthTick}
                aspectRatio="5 / 2"
                margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
              >
                <Grid horizontal fadeHorizontal vertical={false} />
                <Area dataKey="revenue" stroke={seriesSwatch(0)} fill={seriesFill(0)} />
                <XAxis />
                <ChartTooltip content={revenueTooltip} />
              </AreaChart>
            )
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No closed-won revenue yet.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">Upcoming Schedule</h3>
          <Link
            href="/schedule"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {!loading && upcomingSchedule.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled yet.</p>
          )}
          {upcomingSchedule.map((a) => {
            const date = parseISO(a.activity_date);
            const client = clients.find((c) => c.id === a.client_id);
            return (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <div className="flex w-11 shrink-0 flex-col items-center rounded bg-active py-1.5">
                  <span className="text-sm font-bold">{formatDateFns(date, "d")}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{formatDateFns(date, "EEE")}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.description}</p>
                  <p className="truncate text-xs text-muted-foreground">{client?.company ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.follow_up_required && <Badge tone="yellow" dot>Follow-up</Badge>}
                  <span className="text-xs text-muted-foreground">{formatDateFns(date, "h:mm a")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** One headline figure in the hero band, with a quieter second line. */
function HeroStat({
  label,
  value,
  subLabel,
  subValue,
}: {
  label: string;
  value: string;
  subLabel: string;
  subValue: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-[28px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <div className="mt-2.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="truncate text-muted-2">{subLabel}</span>
        <span className="shrink-0 tabular-nums text-foreground-secondary">{subValue}</span>
      </div>
    </div>
  );
}
