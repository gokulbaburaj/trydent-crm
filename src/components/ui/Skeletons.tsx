import { Skeleton } from "@/components/shadcn/skeleton";
import { Card } from "@/components/ui/Card";

/** Shimmering placeholder rows for tables while data loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 px-1 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3.5 w-[22%]" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3.5 w-[18%]" />
          <Skeleton className="ml-auto h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Full dashboard placeholder: stat cards + charts. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-36" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <Skeleton className="h-4 w-28" />
          <div className="flex justify-center py-4">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
        </Card>
        <Card className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-4 w-44" />
          <div className="flex h-44 items-end gap-4 px-4">
            {[60, 90, 45, 75, 100, 55].map((h, i) => (
              <Skeleton key={i} className="w-full rounded-t-md" style={{ height: `${h}%` }} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Project detail placeholder: header card + overview grid. */
export function ProjectPageSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-4 w-40" />
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="ml-auto h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-2/3" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </Card>
      <Skeleton className="h-9 w-80 rounded-md" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="flex flex-col gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-32 w-full rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  );
}
