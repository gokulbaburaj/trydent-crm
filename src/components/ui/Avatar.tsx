import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** Deterministic two-color gradient per name — richer than flat tints. */
const GRADIENTS: [string, string][] = [
  ["#5e6ad2", "#9333ea"],
  ["#4ea7e0", "#5e6ad2"],
  ["#4cb782", "#4ea7e0"],
  ["#d9a53f", "#eb5757"],
  ["#d95c8a", "#9333ea"],
  ["#eb5757", "#d95c8a"],
  ["#0ea5e9", "#4cb782"],
];

function gradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const [a, b] = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

export function Avatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    xs: "h-5 w-5 text-[8px]",
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
  }[size];

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", sizeClasses)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-[var(--shadow-sm)]",
        sizeClasses
      )}
      style={{ background: gradientFor(name) }}
    >
      {initials(name)}
    </div>
  );
}

/** Overlapping avatars for "who's on this". Spills into a +N chip past `max`. */
export function AvatarStack({
  people,
  size = "xs",
  max = 4,
}: {
  people: { id: string; full_name: string; avatar_url?: string | null }[];
  size?: "xs" | "sm";
  max?: number;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const chip = size === "xs" ? "h-5 min-w-5 text-[8px]" : "h-7 min-w-7 text-[10px]";

  return (
    <div className="flex shrink-0 items-center -space-x-1.5">
      {shown.map((p) => (
        <div
          key={p.id}
          title={p.full_name}
          className="rounded-full ring-2 ring-surface"
        >
          <Avatar name={p.full_name} url={p.avatar_url} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div
          title={people.slice(max).map((p) => p.full_name).join(", ")}
          className={cn(
            "flex items-center justify-center rounded-full bg-active px-1 font-medium text-foreground-secondary ring-2 ring-surface",
            chip
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

export function PersonCell({
  name,
  subtitle,
  url,
}: {
  name: string;
  subtitle?: string | null;
  url?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} url={url} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium text-foreground">{name}</div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
