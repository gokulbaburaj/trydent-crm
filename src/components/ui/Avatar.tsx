import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

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
        "flex items-center justify-center rounded-full bg-accent/15 text-accent font-semibold",
        sizeClasses
      )}
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
        <div className="truncate text-sm font-medium">{name}</div>
        {subtitle && (
          <div className="truncate text-xs text-muted">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
