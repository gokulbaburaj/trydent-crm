import { Badge as ShadBadge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

type Tone = "green" | "yellow" | "red" | "blue" | "gray";

const toneClasses: Record<Tone, string> = {
  green: "bg-success/10 text-success",
  yellow: "bg-warning/10 text-warning",
  red: "bg-danger/10 text-danger",
  blue: "bg-blue-500/10 text-blue-400",
  gray: "bg-hover text-foreground-secondary",
};

const dotClasses: Record<Tone, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-danger",
  blue: "bg-blue-400",
  gray: "bg-muted-foreground",
};

/**
 * Exact statuses first, substrings only as a fallback.
 *
 * Substring matching alone got "Inactive Customer" wrong: it contains the
 * letters "active", and the green test ran before the red one, so a churned
 * client rendered as healthy. Any rule based on `includes` has that failure
 * mode somewhere — the explicit table is the honest fix.
 */
const EXACT_TONES: Record<string, Tone> = {
  // Clients
  "active customer": "green",
  "inactive customer": "red",
  prospect: "blue",
  lead: "gray",
  // Deals
  "closed won": "green",
  "closed lost": "red",
  qualified: "blue",
  proposal: "yellow",
  // Projects
  planning: "gray",
  "in progress": "blue",
  review: "yellow",
  delivered: "green",
  "on hold": "red",
  // Tasks
  "not started": "gray",
  done: "green",
  archived: "gray",
  // Portals
  building: "yellow",
  "live: shared with client": "green",
  "client closed": "red",
  "not set up": "gray",
};

export function statusTone(status: string): Tone {
  const s = status.toLowerCase().trim();
  const exact = EXACT_TONES[s];
  if (exact) return exact;

  // Fallback for anything not in the table. Negatives are tested first so a
  // word like "inactive" can never be caught by its own positive substring.
  if (s.includes("lost") || s.includes("inactive") || s.includes("on hold")) return "red";
  if (s.includes("won") || s.includes("active") || s.includes("live") || s.includes("delivered") || s.includes("done")) return "green";
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
