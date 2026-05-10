// Player detail loading skeleton. Mirrors PlayerPage layout: breadcrumb,
// avatar + name + headline value, big chart, stat strip, sales-volume +
// grade-distribution + source-mix tiles, recent sales, variants.

import Skeleton from "@/components/ui/Skeleton";

export default function PlayerLoading() {
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Breadcrumb */}
      <Skeleton className="h-3 w-40 mb-6" />

      {/* Identity + headline */}
      <div className="flex items-start gap-4 mb-6">
        <Skeleton className="h-14 w-14 rounded-full mt-1" />
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-6 w-12" />
          </div>
          <Skeleton className="h-10 w-72 mb-3" />
          <div className="flex items-baseline gap-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      {/* Big chart */}
      <Skeleton className="h-72 w-full mb-3" />
      <div className="flex gap-3 mb-10">
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-8 w-14" />
        <Skeleton className="h-8 w-12" />
      </div>

      {/* Stat strip - 4 stats */}
      <section className="mb-10">
        <div className="border border-border bg-panel-2/40 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="px-5 py-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* Three tile row: volume / grades / sources */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border border-border bg-panel p-4">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-3 w-48 mb-3" />
            <Skeleton className="h-20 w-full" />
            <div className="mt-3 flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </section>

      {/* Recent sales + news */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {[0, 1].map((side) => (
          <div key={side} className="border border-border bg-panel">
            <div className="px-4 py-3 border-b border-border">
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="divide-y divide-border">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="px-4 py-3">
                  <Skeleton className="h-4 w-2/3 mb-1.5" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
