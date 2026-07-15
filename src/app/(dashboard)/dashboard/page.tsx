"use client";

import { useMemo } from "react";
import Link from "next/link";
import { parseISO, format as formatDateFns } from "date-fns";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { DollarSign, TrendingUp, Users, GitBranch, ArrowRight } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useCurrency } from "@/lib/currency";
import type { Deal, Client, Activity } from "@/lib/types";
import { DEAL_STAGES } from "@/lib/types";

/* First slice follows the user's chosen accent; the rest stay fixed. */
const COLORS = [
  "var(--accent)",
  "#4ea7e0",
  "#d9a53f",
  "#d95c8a",
  "#4cb782",
  "#eb5757",
];

/** shadcn-style chart tooltip: dark card, colored swatch, tabular value. */
function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; payload?: { fill?: string } }[];
  label?: string;
  format?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 shadow-xl shadow-black/50">
      {label && <p className="mb-1 text-[11px] font-medium text-muted">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[13px]">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: p.payload?.fill ?? "var(--accent)" }}
          />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-medium tabular-nums text-foreground">
            {format ? format(Number(p.value)) : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { format: formatCurrency } = useCurrency();
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

  const stageData = useMemo(
    () =>
      DEAL_STAGES.map((stage) => ({
        name: stage,
        value: deals.filter((d) => d.deal_stage === stage).length,
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

  const loading = dealsLoading || clientsLoading || activitiesLoading;

  const upcomingSchedule = useMemo(() => {
    const now = new Date();
    return activities
      .filter((a) => parseISO(a.activity_date) >= now)
      .sort((a, b) => parseISO(a.activity_date).getTime() - parseISO(b.activity_date).getTime())
      .slice(0, 6);
  }, [activities]);

  return (
    <div className="flex flex-col gap-6">
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
          <h3 className="mb-4 text-sm font-semibold text-muted">
            Deals by Stage
          </h3>
          {stageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stageData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={86}
                  paddingAngle={4}
                  cornerRadius={6}
                  stroke="none"
                >
                  {stageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <text
                  x="50%"
                  y="47%"
                  textAnchor="middle"
                  fill="var(--foreground)"
                  fontSize="24"
                  fontWeight="600"
                >
                  {stageData.reduce((sum, s) => sum + s.value, 0)}
                </text>
                <text x="50%" y="58%" textAnchor="middle" fill="var(--muted)" fontSize="10">
                  deals
                </text>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No deals yet.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {stageData.map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                {s.name}
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-muted">
            Revenue by Month (Closed Won)
          </h3>
          {monthlyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyRevenue} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="var(--muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  stroke="var(--muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={44}
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("en", { notation: "compact" }).format(Number(v))
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)", radius: 6 }}
                  content={<ChartTip format={(v) => formatCurrency(v)} />}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="var(--accent)"
                  fillOpacity={0.9}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  activeBar={{ fillOpacity: 1 }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted">
              No closed-won revenue yet.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted">Upcoming Schedule</h3>
          <Link
            href="/schedule"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {!loading && upcomingSchedule.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">Nothing scheduled yet.</p>
          )}
          {upcomingSchedule.map((a) => {
            const date = parseISO(a.activity_date);
            const client = clients.find((c) => c.id === a.client_id);
            return (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <div className="flex w-11 shrink-0 flex-col items-center rounded bg-white/10 py-1.5">
                  <span className="text-sm font-bold">{formatDateFns(date, "d")}</span>
                  <span className="text-[10px] uppercase text-muted">{formatDateFns(date, "EEE")}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.description}</p>
                  <p className="truncate text-xs text-muted">{client?.company ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {a.follow_up_required && <Badge tone="yellow" dot>Follow-up</Badge>}
                  <span className="text-xs text-muted">{formatDateFns(date, "h:mm a")}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
