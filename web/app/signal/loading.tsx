// Signal page loading skeleton. Mirrors SignalView layout:
// methodology header + stat strip + filter pills + picks table.

import Skeleton from "@/components/ui/Skeleton";

export default function SignalLoading() {
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-9 w-72 mb-3" />
        <Skeleton className="h-4 w-2/3 max-w-xl" />
      </div>

      {/* Stat strip - 4 stats */}
      <section className="mb-8">
        <div className="border border-border bg-panel-2/40 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-5 py-4">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </section>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Picks table - 10 rows */}
      <div className="border border-border bg-panel divide-y divide-border">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
            <Skeleton className="h-12 w-12 col-span-1" />
            <div className="col-span-4 min-w-0">
              <Skeleton className="h-4 w-3/4 mb-1.5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 col-span-2" />
            <Skeleton className="h-4 col-span-2 ml-auto w-20" />
            <Skeleton className="h-4 col-span-2 ml-auto w-16" />
            <Skeleton className="h-8 col-span-1 ml-auto w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
