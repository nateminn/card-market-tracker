// Card detail - Robinhood-style, player name primary, no ticker.
// Big price + change at top, large chart, time tabs, action buttons,
// stats grid (with InfoTip definitions), other variations linker, recent sales,
// scatter chart filtered to PSA + BGS only.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCard,
  getSparkline,
  getVariations,
  getAnalyticsForCards,
  getActiveListings,
  getPerGradeBuckets,
  type Sale,
} from "@/lib/data";
import { resolveParallel } from "@/lib/parallel";
import Pill from "@/components/ui/Pill";
import Section from "@/components/ui/Section";
import ChangeBadge from "@/components/ui/ChangeBadge";
import TimeRangeTabs from "@/components/ui/TimeRangeTabs";
import InteractiveChart from "@/components/charts/InteractiveChart";
import PriceChart from "@/components/charts/PriceChart";
import CardImage from "@/components/ui/CardImage";
import CardHero from "@/components/ui/CardHero";
import AddToggle from "@/components/ui/AddToggle";
import InfoTip, { DEFINITIONS } from "@/components/ui/InfoTip";

function playerSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const dynamic = "force-dynamic";

const ALLOWED_GRADERS = new Set(["PSA", "BGS"]);

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

/** Filter pricing data to PSA + BGS only - the two trusted graders. */
function filterPricedSales(sales: Sale[]) {
  return sales.filter(
    (s) =>
      !s.is_graded || (s.grader != null && ALLOWED_GRADERS.has(s.grader))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCard(id);
  if (!detail) return { title: "Card not found" };

  const { card, analytics } = detail;
  const priceBit = analytics?.psa10_vwap_30d_usd
    ? `PSA 10: $${Math.round(analytics.psa10_vwap_30d_usd).toLocaleString()}`
    : null;
  const title = `${card.player_name} · ${card.release_year} ${card.release_name}${
    card.is_rookie ? " (RC)" : ""
  }`;
  const description = [
    `${card.set_name} #${card.card_number}.`,
    priceBit,
    "Live sales data, VWAP, and momentum on Cardex.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: card.image_url ? [{ url: card.image_url }] : undefined,
    },
    twitter: {
      card: card.image_url ? "summary_large_image" : "summary",
      title,
      description,
      images: card.image_url ? [card.image_url] : undefined,
    },
  };
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCard(id);
  if (!detail) notFound();

  const { card, sales, analytics } = detail;
  const filtered = filterPricedSales(sales);
  const [spark30, variations, activeListings, perGradeBuckets] = await Promise.all([
    getSparkline(card.id, 30),
    getVariations(card.id),
    getActiveListings(card.id),
    getPerGradeBuckets(card.id),
  ]);
  // Empty graphs help nobody. For low-activity cards, expand the window
  // until we get a chart with real data - 30d → 180d → all-time. The
  // "Sales 30d" stat stays 30d so the headline windowed-stat is unchanged.
  let spark = spark30;
  let sparkWindow: "30 days" | "180 days" | "all available history" = "30 days";
  if (spark.length < 5) {
    const spark180 = await getSparkline(card.id, 180);
    if (spark180.length >= 5) {
      spark = spark180;
      sparkWindow = "180 days";
    } else {
      // Fall through to the longest window we have. 5 years is well past
      // CardSight's rolling pricing window so this is effectively "all-time."
      const sparkAll = await getSparkline(card.id, 365 * 5);
      if (sparkAll.length > 0) {
        spark = sparkAll;
        sparkWindow = "all available history";
      } else {
        spark = spark180; // empty, but at least consistent
        sparkWindow = "180 days";
      }
    }
  }
  const variationAnalytics = await getAnalyticsForCards(variations.map((v) => v.id));
  const lastPrice = spark.at(-1)?.value ?? analytics?.vwap_30d_usd ?? 0;
  const firstPrice = spark.at(0)?.value ?? lastPrice;
  const todayChange = lastPrice - firstPrice;
  const todayPct = firstPrice > 0 ? todayChange / firstPrice : 0;

  const recent = [...filtered]
    .sort(
      (a, b) =>
        new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime(),
    )
    .slice(0, 25);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Breadcrumb --------------------------------------------------- */}
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <Link
          href="/players"
          className="hover:text-fg transition-colors duration-150"
        >
          Players
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <Link
          href={`/players/${playerSlug(card.player_name)}`}
          className="hover:text-fg transition-colors duration-150"
        >
          {card.player_name}
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2 truncate">
          {card.set_name} · #{card.card_number}
        </span>
      </nav>

      {/* Identity + price headline ------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 mb-8">
        <CardHero
          src={card.image_url}
          player={card.player_name}
          alt={`${card.release_year} ${card.release_name} ${card.set_name} #${card.card_number}`}
          width={220}
        />

        <div className="flex flex-col">
          {/* Top row: identity + action buttons. Stack on mobile so the
              buttons don't crash into the brand title. */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-3">
            <div className="min-w-0">
              {/* Card identity - brand and set are PRIMARY (this is /cards/) */}
              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-2 mb-2">
                {card.release_year} · {card.sport}
              </div>
              <h1 className="text-[24px] md:text-[28px] leading-tight font-semibold tracking-tight text-fg mb-1">
                {card.release_name} <span className="text-fg-2">{card.set_name}</span>
              </h1>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <Link
                  href={`/players/${playerSlug(card.player_name)}`}
                  className="text-base text-fg-2 hover:text-accent transition-colors duration-150"
                >
                  {card.player_name}
                </Link>
                <span className="text-muted-2">·</span>
                <span className="font-mono text-sm text-muted tabular">#{card.card_number}</span>
                {card.is_rookie ? <Pill tone="up">RC</Pill> : null}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <AddToggle cardId={card.id} bucket="watchlist" />
              <AddToggle cardId={card.id} bucket="portfolio" />
            </div>
          </div>

          {/* Price block */}
          <div className="mt-2">
            <div className="text-[44px] leading-none font-semibold tracking-tight text-fg">
              {fmtUsd(lastPrice)}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ChangeBadge pct={todayPct} abs={todayChange} />
              <span className="text-sm text-muted">Last {sparkWindow}</span>
            </div>
            <p className="mt-3 text-[12px] text-muted-2 inline-flex items-center gap-1.5 max-w-prose">
              <InfoTip k="variations" side="bottom" />
              Average across PSA &amp; BGS sales of this specific card. {card.player_name} has{" "}
              {variations.length}{" "}
              other {variations.length === 1 ? "variation" : "variations"} with different prices.
            </p>
          </div>
        </div>
      </div>

      {/* Big chart with type toggle ---------------------------------- */}
      <div className="mb-2">
        <InteractiveChart points={spark} height={240} />
      </div>
      <div className="mb-10">
        <TimeRangeTabs defaultValue="1M" />
      </div>

      {/* Stats grid -------------------------------------------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-fg mb-3 inline-flex items-center gap-2">
          Key statistics
          <span className="text-[11px] font-normal font-mono uppercase tracking-[0.08em] text-muted-2">
            PSA + BGS only
          </span>
        </h2>
        <div className="border border-border bg-panel grid grid-cols-2 md:grid-cols-4 divide-y divide-x divide-border">
          <Stat
            label="VWAP 30d"
            tipKey="vwap_30d"
            value={fmtUsd(analytics?.vwap_30d_usd)}
          />
          <Stat
            label="VWAP 7d"
            tipKey="vwap_7d"
            value={fmtUsd(analytics?.vwap_7d_usd)}
          />
          <Stat
            label="PSA 10 30d"
            tipKey="psa10_30d"
            value={fmtUsd(analytics?.psa10_vwap_30d_usd)}
          />
          <Stat
            label="Sales 30d"
            tipKey="sales_30d"
            value={analytics?.sales_count_30d?.toString() ?? "-"}
          />
          <Stat
            label="Velocity"
            tipKey="velocity"
            value={
              analytics?.velocity_score != null
                ? `${analytics.velocity_score.toFixed(2)}/d`
                : "-"
            }
          />
          <Stat
            label="Momentum"
            tipKey="momentum"
            value=""
            customValue={
              <ChangeBadge pct={analytics?.momentum_score ?? null} size="md" />
            }
          />
          <Stat
            label="Confidence"
            tipKey="confidence"
            value={analytics?.confidence ?? "-"}
            valueClass="capitalize"
          />
          <Stat
            label="VWAP 90d"
            tipKey="vwap_90d"
            value={fmtUsd(analytics?.vwap_90d_usd)}
          />
        </div>
        {analytics?.thesis ? (
          <p className="mt-4 text-sm text-fg-2 max-w-3xl inline-flex gap-2 items-start">
            <InfoTip k="thesis" side="right" />
            {analytics.thesis}
          </p>
        ) : null}
      </section>

      {/* Per-grade pricing breakdown -------------------------------- */}
      {perGradeBuckets.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-fg mb-1">By grade</h2>
          <p className="text-[12px] text-muted mb-3 max-w-3xl">
            Volume-weighted average price for every grade tier with
            sales in the last 90 days. PSA, BGS, SGC, CGC tracked
            separately so you can see where the gem premium actually
            sits.
          </p>
          <div className="border border-border bg-panel overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
                <div className="w-24">Grade</div>
                <div className="flex-1 min-w-0" />
                <div className="w-24 text-right">VWAP 30d</div>
                <div className="w-24 text-right">Median 30d</div>
                <div className="w-24 text-right">VWAP 90d</div>
                <div className="w-16 text-right">Sales 30d</div>
                <div className="w-16 text-right">Sales 90d</div>
              </div>
              {perGradeBuckets.map((b) => {
                const label =
                  b.grader === "RAW" ? "Raw" : `${b.grader} ${b.grade_value}`;
                return (
                  <div
                    key={`${b.grader}|${b.grade_value}`}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 text-sm"
                  >
                    <div className="w-24 font-mono text-fg">{label}</div>
                    <div className="flex-1 min-w-0" />
                    <div className="w-24 text-right font-mono text-fg tabular">
                      {fmtUsd(b.vwap_30d)}
                    </div>
                    <div className="w-24 text-right font-mono text-fg-2 tabular">
                      {fmtUsd(b.median_30d)}
                    </div>
                    <div className="w-24 text-right font-mono text-muted tabular">
                      {fmtUsd(b.vwap_90d)}
                    </div>
                    <div className="w-16 text-right font-mono text-fg-2 tabular">
                      {b.sales_30d}
                    </div>
                    <div className="w-16 text-right font-mono text-muted tabular">
                      {b.sales_90d}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* Grade multiples - gem premium analytics ----------------------- */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-fg mb-1">Grade multiples</h2>
        <p className="text-[12px] text-muted mb-3 max-w-3xl">
          How much more a higher grade trades for, vs. the next grade down. A
          PSA 10 trading at a 1.8× multiple of PSA 9 means the gem premium is
          80%. Helpful for pop-projection and crackout math.
        </p>
        <div className="border border-border bg-panel grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          <MultipleStat
            label="PSA 10 / PSA 9"
            tipKey="psa10_to_psa9"
            multiple={analytics?.psa10_to_psa9_multiple ?? null}
            top={analytics?.psa10_vwap_30d_usd ?? null}
            bot={analytics?.psa9_vwap_90d_usd ?? null}
          />
          <MultipleStat
            label="BGS 9.5 / BGS 9"
            tipKey="bgs95_to_bgs9"
            multiple={analytics?.bgs95_to_bgs9_multiple ?? null}
            top={analytics?.bgs95_vwap_90d_usd ?? null}
            bot={analytics?.bgs9_vwap_90d_usd ?? null}
          />
          <MultipleStat
            label="BGS 10 / BGS 9.5"
            tipKey="bgs10_to_bgs95"
            multiple={analytics?.bgs10_to_bgs95_multiple ?? null}
            top={analytics?.bgs10_vwap_90d_usd ?? null}
            bot={analytics?.bgs95_vwap_90d_usd ?? null}
          />
        </div>
      </section>

      {/* Other variations linker --------------------------------------- */}
      {variations.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-fg mb-3">
            Other {card.player_name} cards
            <span className="ml-2 text-sm font-normal text-muted">
              ({variations.length})
            </span>
          </h2>
          <div className="border border-border bg-panel">
            {variations.map((v) => (
              <Link
                key={v.id}
                href={`/cards/${v.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150"
              >
                <CardImage
                  src={v.image_url}
                  player={v.player_name}
                  alt={`${v.release_year} ${v.release_name} ${v.set_name}`}
                  width={28}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-fg-2 truncate">
                    {v.release_year} {v.release_name} · {v.set_name} · #{v.card_number}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {v.is_rookie ? "Rookie" : "Variant"}
                  </div>
                </div>
                <div className="w-20 text-right font-mono text-[11px] tabular text-muted-2 uppercase tracking-wider">
                  PSA 10
                </div>
                <div className="w-24 text-right font-mono text-sm tabular text-fg">
                  {fmtUsd(variationAnalytics.get(v.id)?.psa10_vwap_30d_usd)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Full sales scatter ------------------------------------------ */}
      <section className="mb-10">
        <Section
          title={`Sales (${filtered.length})`}
          eyebrow="Price history · all parallels · raw + PSA + BGS"
          action={
            <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.08em] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-info" /> Raw
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-up" /> PSA 10
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warn" /> Other graded
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="block w-3 h-px bg-accent" /> VWAP-10
              </span>
            </div>
          }
        />
        <div className="border border-border bg-panel p-4">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-fg">No PSA or BGS sales tracked yet.</p>
              <p className="mt-1.5 text-[12px] text-muted">
                CardSight pricing is sparse for newly-released cards. Check back later, or try a more-traded variant.
              </p>
            </div>
          ) : (
            <PriceChart sales={filtered} />
          )}
        </div>
      </section>

      {/* Active listings - what's available to BUY right now ----------- */}
      {activeListings.length > 0 ? (
        <section className="mb-10">
          {(() => {
            const sourceSet = new Set(
              activeListings.map((l) => l.source_system).filter(Boolean),
            );
            const dualSource = sourceSet.size >= 2;
            return (
              <>
                <Section
                  eyebrow={
                    dualSource
                      ? "Active listings · cross-checked across two sources"
                      : "Active listings · live on eBay"
                  }
                  title={`${activeListings.length} available now`}
                />
                <p className="text-[12px] text-muted-2 mb-3 max-w-3xl leading-relaxed">
                  Open eBay listings sorted by ask price (lowest first). These
                  are distinct from the completed-sales table below - they
                  haven&apos;t sold yet.
                  {dualSource ? (
                    <>
                      {" "}Cardex pulls from two independent sources
                      (CardSight&apos;s indexed feed + eBay Browse direct);
                      each row is tagged with where it came from.
                    </>
                  ) : null}
                </p>
              </>
            );
          })()}
          <div className="border border-border bg-panel overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
                <div className="w-8" />
                <div className="w-20">Type</div>
                <div className="w-20">Grade</div>
                <div className="w-[100px]">Parallel</div>
                <div className="w-32">Ends</div>
                <div className="w-24 text-right">Ask</div>
                <div className="flex-1 min-w-0">Title</div>
              </div>
              {activeListings.slice(0, 25).map((l) => (
                <a
                  key={l.id}
                  href={l.external_url ?? "#"}
                  target={l.external_url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150 text-sm"
                >
                  <div className="w-8 shrink-0">
                    {l.image_url ? (
                      <img
                        src={l.image_url}
                        alt=""
                        width={32}
                        height={45}
                        className="block border border-border-2 object-cover"
                        style={{ width: 32, height: 45 }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="bg-panel-2 border border-border"
                        style={{ width: 32, height: 45 }}
                      />
                    )}
                  </div>
                  <div className="w-20 text-[10px] font-mono uppercase tracking-wider text-muted-2">
                    <div>{l.listing_type === "auction" ? "Auction" : "Buy now"}</div>
                    {l.source_system ? (
                      <div
                        className={
                          l.source_system === "ebay-browse"
                            ? "mt-0.5 text-[9px] text-info"
                            : "mt-0.5 text-[9px] text-muted-2"
                        }
                        title={
                          l.source_system === "ebay-browse"
                            ? "Sourced directly from eBay Browse API"
                            : "Sourced from CardSight indexed feed"
                        }
                      >
                        {l.source_system === "ebay-browse" ? "eBay" : "CS"}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-20 font-mono text-fg text-[12px]">
                    {l.is_graded ? `${l.grader ?? ""} ${l.grade_value ?? ""}`.trim() : "Raw"}
                  </div>
                  <div className="w-[100px]">
                    {(() => {
                      const p = resolveParallel({
                        parallel_name: l.parallel_name,
                        external_title: l.external_title,
                      });
                      return (
                        <span
                          className={
                            p.isBase
                              ? "text-[10px] font-mono uppercase tracking-wider text-muted-2 px-1.5 py-0.5 border border-border-2 inline-block"
                              : "text-[10px] font-mono uppercase tracking-wider text-accent px-1.5 py-0.5 border border-accent/40 bg-accent/5 truncate inline-block max-w-full"
                          }
                          title={p.label}
                        >
                          {p.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="w-32 text-[12px] text-muted">
                    {l.listing_type === "auction" && l.end_date ? (
                      <>
                        {new Date(l.end_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {l.bid_count != null ? (
                          <span className="ml-2 text-muted-2">{l.bid_count} bids</span>
                        ) : null}
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                  <div className="w-24 text-right font-mono text-fg tabular">
                    ${l.price_usd.toFixed(2)}
                  </div>
                  <div className="flex-1 min-w-0 truncate text-info text-[12px]" title={l.external_title ?? undefined}>
                    {l.external_title}
                    <span aria-hidden className="ml-1 text-[9px]">↗</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Recent sales table ------------------------------------------- */}
      <section>
        {(() => {
          const dates = recent.map((s) => new Date(s.sold_at).getTime());
          const oldest = dates.length ? new Date(Math.min(...dates)) : null;
          const newest = dates.length ? new Date(Math.max(...dates)) : null;
          const fmt = (d: Date) =>
            d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          const range =
            oldest && newest && oldest.getTime() !== newest.getTime()
              ? `${fmt(oldest)} – ${fmt(newest)}`
              : oldest
                ? fmt(oldest)
                : null;
          return (
            <>
              <Section
                eyebrow="Completed sales · eBay sold listings"
                title={range ? `${recent.length} sold · ${range}` : `${recent.length} sold`}
              />
              <p className="text-[12px] text-muted-2 mb-3 max-w-3xl leading-relaxed">
                <strong className="text-up">Already sold.</strong> Every row
                here is an eBay completed listing - base or parallel of card
                #{card.card_number}. The eBay link opens the original sold
                listing; if the seller relisted, the URL may now show the
                relist as active, but the sale itself is real and dated.
              </p>
            </>
          );
        })()}
        {recent.length === 0 ? (
          <div className="border border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
            No recent sales to show.
          </div>
        ) : (
          <div className="border border-border bg-panel overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
              <div className="w-8" />
              <div className="w-24">Sold</div>
              <div className="w-20">Grade</div>
              <div className="w-[100px]">Parallel</div>
              <div className="w-20">Source</div>
              <div className="w-24 text-right">Price</div>
              <div className="flex-1 min-w-0">Title</div>
            </div>
            {recent.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150 text-sm"
              >
                <div className="w-8 shrink-0">
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt=""
                      width={32}
                      height={45}
                      className="block border border-border-2 object-cover"
                      style={{ width: 32, height: 45 }}
                      draggable={false}
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="bg-panel-2 border border-border"
                      style={{ width: 32, height: 45 }}
                    />
                  )}
                </div>
                <div className="w-24 font-mono text-muted tabular text-[12px]">
                  {new Date(s.sold_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="w-20 font-mono text-fg">
                  {s.is_graded ? `${s.grader ?? ""} ${s.grade_value ?? ""}`.trim() : "Raw"}
                </div>
                <div className="w-[100px]">
                  {(() => {
                    const p = resolveParallel({
                      parallel_name: s.parallel_name,
                      external_title: s.external_title,
                    });
                    return (
                      <span
                        className={
                          p.isBase
                            ? "text-[10px] font-mono uppercase tracking-wider text-muted-2 px-1.5 py-0.5 border border-border-2 inline-block"
                            : "text-[10px] font-mono uppercase tracking-wider text-accent px-1.5 py-0.5 border border-accent/40 bg-accent/5 truncate inline-block max-w-full"
                        }
                        title={p.label}
                      >
                        {p.label}
                      </span>
                    );
                  })()}
                </div>
                <div className="w-20 text-[12px]">
                  {s.external_url ? (
                    <a
                      href={s.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:text-accent transition-colors duration-150 inline-flex items-center gap-1"
                      title="Opens the original eBay listing - may show as active if relisted"
                    >
                      {s.source}
                      <span aria-hidden className="text-[9px]">↗</span>
                    </a>
                  ) : (
                    <span className="text-muted">{s.source}</span>
                  )}
                </div>
                <div className="w-24 text-right font-mono text-fg tabular">
                  ${s.price_usd.toFixed(2)}
                </div>
                <div className="flex-1 min-w-0 truncate text-muted text-[12px]" title={s.external_title ?? undefined}>
                  {s.external_title}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  tipKey,
  value,
  customValue,
  valueClass,
}: {
  label: string;
  tipKey: keyof typeof DEFINITIONS;
  value: string;
  customValue?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] text-muted font-mono uppercase tracking-[0.06em] inline-flex items-center gap-1.5">
        {label}
        <InfoTip k={tipKey} side="bottom" />
      </div>
      <div className="mt-1.5">
        {customValue ?? (
          <span className={`font-mono text-base text-fg tabular ${valueClass ?? ""}`}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

function MultipleStat({
  label,
  tipKey,
  multiple,
  top,
  bot,
}: {
  label: string;
  tipKey: keyof typeof DEFINITIONS;
  multiple: number | null;
  top: number | null;
  bot: number | null;
}) {
  const display = multiple != null ? `${multiple.toFixed(2)}×` : "-";
  // Color the multiple by magnitude - 1.5× is normal, 3× is gem-premium territory.
  const tone =
    multiple == null
      ? "text-muted"
      : multiple >= 3
      ? "text-up"
      : multiple >= 1.5
      ? "text-fg"
      : "text-fg-2";
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] text-muted font-mono uppercase tracking-[0.06em] inline-flex items-center gap-1.5">
        {label}
        <InfoTip k={tipKey} side="bottom" />
      </div>
      <div className={`mt-2 font-mono text-3xl tabular ${tone}`}>{display}</div>
      <div className="mt-2 text-[11px] text-muted-2 font-mono tabular">
        {top != null ? fmtUsd(top) : "-"}{" / "}
        {bot != null ? fmtUsd(bot) : "-"}
      </div>
    </div>
  );
}
