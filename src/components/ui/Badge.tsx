import { cn } from "@/lib/utils";

type Tone = "green" | "yellow" | "red" | "blue" | "gray";

const toneClasses: Record<Tone, string> = {
  green: "bg-accent/15 text-accent",
  yellow: "bg-warning/15 text-warning",
  red: "bg-danger/15 text-danger",
  blue: "bg-blue-500/15 text-blue-400",
  gray: "bg-muted/15 text-muted",
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
  if (s.includes("won") || s.includes("active") || s.includes("live")) return "green";
  if (s.includes("lost") || s.includes("inactive") || s.includes("closed")) return "red";
  if (s.includes("negotiation") || s.includes("building") || s.includes("proposal")) return "yellow";
  if (s.includes("qualified") || s.includes("prospect")) return "blue";
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
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} />}
      {children}
    </span>
  );
}
