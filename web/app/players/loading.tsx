// Players list loading skeleton. Mirrors PlayersTable layout:
// header + search box + 12 row table.

import Skeleton from "@/components/ui/Skeleton";

export default function PlayersLoading() {
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-40 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Table */}
      <div className="border border-border bg-panel">
        {/* Header row */}
        <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-border bg-panel-2">
          {[3, 2, 2, 2, 2, 1].map((span, i) => (
            <div
              key={i}
              className={`col-span-${span} ${i >= 3 ? "text-right" : ""}`}
            >
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
        {/* Body rows */}
        <div className="divide-y divide-border">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-12 items-center gap-3 px-4 py-3"
            >
              <div className="col-span-3 flex items-center gap-3 min-w-0">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-3/4 mb-1" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-4 col-span-2" />
              <Skeleton className="h-4 col-span-2" />
              <Skeleton className="h-4 col-span-2 ml-auto w-20" />
              <Skeleton className="h-4 col-span-2 ml-auto w-16" />
              <Skeleton className="h-4 col-span-1 ml-auto w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
