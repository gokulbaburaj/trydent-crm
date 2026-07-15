import { Badge as ShadBadge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

type Tone = "green" | "yellow" | "red" | "blue" | "gray";

const toneClasses: Record<Tone, string> = {
  green: "bg-success/10 text-success",
  yellow: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  blue: "bg-blue-500/10 text-blue-400",
  gray: "bg-white/5 text-foreground-secondary",
};

const dotClasses: Record<Tone, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  blue: "bg-blue-400",
  gray: "bg-muted-foreground",
};

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("won") || s.includes("active") || s.includes("live") || s.includes("delivered") || s.includes("done")) return "green";
  if (s.includes("lost") || s.includes("inactive") || s.includes("closed") || s.includes("on hold")) return "red";
  if (s.includes("negotiation") || s.includes("building") || s.includes("proposal") || s.includes("review")) return "yellow";
  if (s.includes("qualified") || s.includes("prospect") || s.includes("in progress")) return "blue";
  return "gray";
}

/** shadcn/ui Badge with our status tone system layered on top. */
export function Badge({
  children,
  tone = "gray",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <ShadBadge
      variant="outline"
      className={cn("gap-1.5 border-white/5 px-2.5 py-0.5", toneClasses[tone], className)}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])} />}
      {children}
    </ShadBadge>
  );
}
