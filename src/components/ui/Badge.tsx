import { cn } from "@/lib/utils";

type Tone = "green" | "yellow" | "red" | "blue" | "gray";

const toneClasses: Record<Tone, string> = {
  green: "bg-accent/10 text-accent",
  yellow: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  blue: "bg-blue-500/10 text-blue-400",
  gray: "bg-white/5 text-foreground-secondary",
};

const dotClasses: Record<Tone, string> = {
  green: "bg-accent",
  yellow: "bg-warning",
  red: "bg-danger",
  blue: "bg-blue-400",
  gray: "bg-muted",
};

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("won") || s.includes("active") || s.includes("live") || s.includes("delivered")) return "green";
  if (s.includes("lost") || s.includes("inactive") || s.includes("closed") || s.includes("on hold")) return "red";
  if (s.includes("negotiation") || s.includes("building") || s.includes("proposal") || s.includes("review")) return "yellow";
  if (s.includes("qualified") || s.includes("prospect") || s.includes("in progress")) return "blue";
  return "gray";
}

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
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-white/5 px-2 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])} />}
      {children}
    </span>
  );
}
