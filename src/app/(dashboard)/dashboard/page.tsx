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

const COLORS = [
  "#5e6ad2",
  "#4ea7e0",
  "#d9a53f",
  "#d95c8a",
  "#4cb782",
  "#eb5757",
];

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
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {stageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 12,
                    color: "#f4f4f5",
                  }}
                />
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
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="month" stroke="#9a9aa2" fontSize={12} />
                <YAxis stroke="#9a9aa2" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "rgba(34,197,94,0.08)" }}
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 12,
                    color: "#f4f4f5",
                  }}
                  formatter={(v) => formatCurrency(Number(v))}
                />
                <Bar dataKey="revenue" fill="#5e6ad2" radius={[4, 4, 0, 0]} />
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
