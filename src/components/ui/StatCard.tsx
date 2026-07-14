import { LucideIcon } from "lucide-react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: { value: string; positive?: boolean };
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        {Icon && (
          <div className="rounded-full bg-accent/10 p-2">
            <Icon className="h-4 w-4 text-accent" />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
      {trend && (
        <span
          className={cn(
            "text-xs font-medium",
            trend.positive ? "text-accent" : "text-danger"
          )}
        >
          {trend.value}
        </span>
      )}
    </Card>
  );
}
