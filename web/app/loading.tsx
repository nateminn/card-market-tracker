// Home loading skeleton. Mirrors the rendered layout so the page
// shell is stable while server data resolves - no white-flash, no
// content-jump when results land. Uses the existing .skeleton CSS
// (1.4s opacity pulse, respects prefers-reduced-motion).

import Skeleton from "@/components/ui/Skeleton";

export default function HomeLoading() {
  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Hero block */}
      <div className="mb-10">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-12 w-3/4 max-w-2xl mb-4" />
        <Skeleton className="h-4 w-2/3 max-w-xl mb-2" />
        <Skeleton className="h-4 w-1/2 max-w-md mb-6" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-44" />
        </div>
      </div>

      {/* Index strip - 3 stat cards */}
      <section className="mb-10">
        <div className="border border-border bg-panel-2/40 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-5 py-4">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>
      </section>

      {/* Movers: two tables, 5 rows each */}
      <section className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((side) => (
          <div key={side}>
            <div className="flex items-baseline justify-between mb-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="border border-border bg-panel divide-y divide-border">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 items-center gap-3 px-4 py-3"
                >
                  <div className="col-span-5 min-w-0">
                    <Skeleton className="h-4 w-2/3 mb-1.5" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <div className="col-span-3">
                    <Skeleton className="h-6 w-full" />
                  </div>
                  <div className="col-span-2 text-right">
                    <Skeleton className="h-4 w-16 ml-auto" />
                  </div>
                  <div className="col-span-2 text-right">
                    <Skeleton className="h-5 w-14 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Signal picks teaser - 5 cards */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="border border-border bg-panel p-3">
              <Skeleton className="aspect-[3/4] w-full mb-3" />
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-3 w-1/2 mb-2" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Big trades - 8 rows */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="border border-border bg-panel divide-y divide-border">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
              <div className="col-span-2">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="col-span-4">
                <Skeleton className="h-4 w-2/3 mb-1" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="col-span-2">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="col-span-2 text-right">
                <Skeleton className="h-5 w-20 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
