import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

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
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
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
        className={cn("rounded-full object-cover", sizeClasses)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm",
        sizeClasses
      )}
      style={{ background: gradientFor(name) }}
    >
      {initials(name)}
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
