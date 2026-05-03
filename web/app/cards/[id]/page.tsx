// Card detail — Robinhood-style, player name primary, no ticker.
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
  type Sale,
} from "@/lib/data";
import { detectParallel } from "@/lib/parallel";
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
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

/** Filter pricing data to PSA + BGS only — the two trusted graders. */
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
  const [spark, variations] = await Promise.all([
    getSparkline(card.id),
    getVariations(card.id),
  ]);
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
              {/* Card identity — brand and set are PRIMARY (this is /cards/) */}
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
              <span className="text-sm text-muted">Last 30 days</span>
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
            value={analytics?.sales_count_30d?.toString() ?? "—"}
          />
          <Stat
            label="Velocity"
            tipKey="velocity"
            value={
              analytics?.velocity_score != null
                ? `${analytics.velocity_score.toFixed(2)}/d`
                : "—"
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
            value={analytics?.confidence ?? "—"}
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

      {/* Grade multiples — gem premium analytics ----------------------- */}
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
          eyebrow="Price history · PSA + BGS only"
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

      {/* Recent sales table ------------------------------------------- */}
      <section>
        <Section
          eyebrow="Recent sales · all parallels"
          title={`Last ${recent.length}`}
        />
        <p className="text-[12px] text-muted-2 mb-3 max-w-3xl leading-relaxed">
          eBay sold listings for this card number — base + every parallel.
          Parallel labels are detected from the listing title and may miss
          edge cases. The eBay link can show the listing as active if the
          seller relisted; the sale itself is real.
        </p>
        {recent.length === 0 ? (
          <div className="border border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
            No recent sales to show.
          </div>
        ) : (
          <div className="border border-border bg-panel overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
              <div className="w-8" />
              <div className="w-24">Date</div>
              <div className="w-20">Grade</div>
              <div className="w-[68px]">Parallel</div>
              <div className="w-20">Source</div>
              <div className="w-24 text-right">Price</div>
              <div className="flex-1 min-w-0">Title</div>
            </div>
            {recent.map((s) => {
              const parallel = detectParallel(s.external_title);
              return (
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
                <span
                  className={
                    parallel.isBase
                      ? "shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-2 px-1.5 py-0.5 border border-border-2"
                      : "shrink-0 text-[10px] font-mono uppercase tracking-wider text-accent px-1.5 py-0.5 border border-accent/40 bg-accent/5"
                  }
                >
                  {parallel.label}
                </span>
                <div className="w-20 text-[12px]">
                  {s.external_url ? (
                    <a
                      href={s.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:text-accent transition-colors duration-150 inline-flex items-center gap-1"
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
              );
            })}
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
  const display = multiple != null ? `${multiple.toFixed(2)}×` : "—";
  // Color the multiple by magnitude — 1.5× is normal, 3× is gem-premium territory.
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
        {top != null ? fmtUsd(top) : "—"}{" / "}
        {bot != null ? fmtUsd(bot) : "—"}
      </div>
    </div>
  );
}
