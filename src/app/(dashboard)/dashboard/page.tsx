"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseISO, format as formatDateFns } from "date-fns";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { AreaChart, Area } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { cn } from "@/lib/utils";
import { DollarSign, TrendingUp, Users, GitBranch, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useCurrency } from "@/lib/currency";
import { useAuth } from "@/lib/useAuth";
import { DashboardSkeleton } from "@/components/ui/Skeletons";
import type { Deal, Client, Activity } from "@/lib/types";
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
type RevenueChart = "bar" | "area";

const REVENUE_CHARTS: { id: RevenueChart; label: string; hint: string }[] = [
  { id: "bar", label: "Bar", hint: "Compare month totals" },
  { id: "area", label: "Area", hint: "See the trend and volume" },
];

export default function DashboardPage() {
  const { format: formatCurrency } = useCurrency();
  const [revenueChart, setRevenueChart] = useState<RevenueChart>("bar");
  const { profile } = useAuth();
  const { rows: deals, loading: dealsLoading } = useSupabaseTable<Deal>("deals");
  const { rows: clients, loading: clientsLoading } = useSupabaseTable<Client>("clients");
  const { rows: activities, loading: activitiesLoading } = useSupabaseTable<Activity>(
    "activities",
    { column: "activity_date", ascending: false }
  );

  const totalPipeline = useMemo(
    () =>
      deals
        .filter((d) => d.deal_stage !== "Closed Won" && d.deal_stage !== "Closed Lost")
        .reduce((sum, d) => sum + Number(d.deal_value), 0),
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
      .reduce((sum, d) => sum + Number(d.deal_value), 0);
  }, [deals]);

  const activeClients = clients.filter(
    (c) => c.status === "Active Customer"
  ).length;

  const openDeals = deals.filter(
    (d) => d.deal_stage !== "Closed Won" && d.deal_stage !== "Closed Lost"
  ).length;

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
        months[key] = (months[key] || 0) + Number(d.deal_value);
      });
    return Object.entries(months).map(([month, revenue]) => ({ month, revenue }));
  }, [deals]);

  /** Shared tooltip so bar and area read identically. */
  const revenueTooltip = ({ point }: { point: Record<string, unknown> }) => (
    <div>
      <p className="text-[11px] text-muted-foreground">{String(point.month)}</p>
      <p className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
        {formatCurrency(Number(point.revenue))}
      </p>
    </div>
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
    <div className="relative flex flex-col gap-6">
      {/* Whisper of brand color behind the header */}
      <div
        className="pointer-events-none absolute -inset-x-6 -top-6 h-44"
        style={{
          background:
            "radial-gradient(55% 100% at 50% 0%, color-mix(in oklab, var(--primary) 9%, transparent), transparent)",
        }}
      />

      <div className="relative">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Pipeline Value"
          value={formatCurrency(totalPipeline)}
          icon={DollarSign}
        />
        <StatCard
          label="Closed Won This Year"
          value={formatCurrency(closedWonThisYear)}
          icon={TrendingUp}
        />
        <StatCard
          label="Active Clients"
          value={String(activeClients)}
          icon={Users}
        />
        <StatCard
          label="Open Deals"
          value={String(openDeals)}
          icon={GitBranch}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground">
            Deals by Stage
          </h3>
          {stageData.length > 0 ? (
            <div className="flex h-[240px] items-center justify-center">
              <PieChart
                data={stageData}
                size={220}
                innerRadius={62}
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
            <p className="py-16 text-center text-sm text-muted-foreground">No deals yet.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
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
                <Grid horizontal vertical={false} />
                <Bar dataKey="revenue" fill="var(--primary)" />
                <BarXAxis />
                <ChartTooltip content={revenueTooltip} />
              </BarChart>
            ) : (
              <AreaChart
                data={monthlyRevenue}
                xDataKey="month"
                aspectRatio="5 / 2"
                margin={{ top: 24, right: 16, bottom: 36, left: 16 }}
              >
                <Grid horizontal vertical={false} />
                <Area dataKey="revenue" stroke="var(--primary)" fill="var(--primary)" />
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
