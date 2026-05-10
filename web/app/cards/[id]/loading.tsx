// Card detail loading skeleton. Mirrors /cards/[id]: breadcrumb,
// hero (image + identity + headline price), big chart, time-range tabs,
// per-grade buckets, active listings, recent sales.

import Skeleton from "@/components/ui/Skeleton";

export default function CardLoading() {
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Breadcrumb */}
      <Skeleton className="h-3 w-72 mb-6" />

      {/* Hero row: image + identity */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 mb-8">
        <Skeleton className="aspect-[3/4] w-full" />
        <div className="flex flex-col">
          <Skeleton className="h-3 w-32 mb-3" />
          <Skeleton className="h-8 w-2/3 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-6" />
          <Skeleton className="h-9 w-44 mb-2" />
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>

      {/* Big chart */}
      <Skeleton className="h-64 w-full mb-3" />
      <div className="flex gap-2 mb-10">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-12" />
        ))}
      </div>

      {/* Per-grade buckets - 4-up */}
      <section className="mb-10">
        <Skeleton className="h-5 w-24 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border border-border bg-panel p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-7 w-24 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </section>

      {/* Active listings + recent sales side-by-side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((side) => (
          <div key={side} className="border border-border bg-panel">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <Skeleton className="h-12 w-12 shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/4 mb-1.5" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
