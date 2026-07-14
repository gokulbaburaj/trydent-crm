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
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && (
          <div className="rounded bg-surface-raised p-1.5">
            <Icon className="h-3.5 w-3.5 text-muted" />
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-foreground">{value}</div>
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
