"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseISO, format as formatDateFns } from "date-fns";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { BarChart } from "@/components/charts/bar-chart";
import { seriesFill, seriesSwatch } from "@/lib/chartSeries";
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

/* First slice follows the user's chosen primary; the rest stay fixed. */
const COLORS = [
  "var(--primary)",
  "#4ea7e0",
  "#d9a53f",
  "#d95c8a",
  "#4cb782",
  "#eb5757",
];

/** Chart shapes that actually suit a monthly revenue series. */
type RevenueChart = "bar" | "line" | "area";

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
  const dealBase = (d: Deal) => toBase(Number(d.deal_value), (d.currency as CurrencyCode) ?? base);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

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

  const monthlyRevenue = useMemo(() => {
    const months: Record<string, number> = {};
    deals
      .filter((d) => d.deal_stage === "Closed Won" && d.close_date)
      .forEach((d) => {
        const key = new Date(d.close_date as string).toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        });
        months[key] = (months[key] || 0) + dealBase(d);
      });
    return Object.entries(months).map(([month, revenue]) => ({ month, revenue }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

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
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground"
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
                      ? "bg-white/10 text-foreground"
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
                xDataKey="month"
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
                xDataKey="month"
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
                <div className="flex w-11 shrink-0 flex-col items-center rounded bg-white/10 py-1.5">
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
