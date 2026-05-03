// Player detail — the canonical "asset" page. Aggregates across the player's
// cards, lets the user filter by grade tier and time range, shows variants,
// recent sales, news, bio.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPlayer,
  getPlayerSparkline,
  getPlayerSales,
  getPlayerBio,
  getPlayerNews,
  getAnalytics,
} from "@/lib/data";
import Pill from "@/components/ui/Pill";
import Section from "@/components/ui/Section";
import AddToggle from "@/components/ui/AddToggle";
import ChangeBadge from "@/components/ui/ChangeBadge";
import InfoTip from "@/components/ui/InfoTip";
import HBars from "@/components/charts/HBars";
import VolumeBar from "@/components/charts/VolumeBar";
import PlayerAvatar from "@/components/ui/PlayerAvatar";
import PlayerView from "./PlayerView";
import CompareSection from "./CompareSection";
import VariantsList from "./VariantsList";
import FeaturedCards from "./FeaturedCards";
import { getPlayers } from "@/lib/data";
import { Newspaper, BarChart3, Layers, Star } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayer(slug);
  if (!player) return { title: "Player not found" };
  const title = `${player.name} · ${player.sport}`;
  const description = `Track ${player.name}&apos;s card market on Cardex. ${player.cards.length} cards across releases, with live sales, VWAP, and momentum.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = await getPlayer(slug);
  if (!player) notFound();

  const [allSales, allPlayers, spark30] = await Promise.all([
    getPlayerSales(slug),
    getPlayers(),
    getPlayerSparkline(slug, 30),
  ]);
  // Pre-fetch analytics for every variant card so the JSX below can be sync.
  const analyticsByCard = new Map<string, Awaited<ReturnType<typeof getAnalytics>>>();
  await Promise.all(
    player.cards.map(async (c) => {
      analyticsByCard.set(c.id, await getAnalytics(c.id));
    }),
  );
  const bio = getPlayerBio(slug);
  const news = getPlayerNews(player.name);
  const psa10Sales = allSales.filter(
    (s) => s.grader === "PSA" && String(s.grade_value) === "10",
  );

  const recent = allSales.slice(0, 25);

  // Volume by day (count of sales) for the past 30 days
  const cutoff30 = Date.now() - 30 * 86400 * 1000;
  const volByDay = new Map<number, number>();
  for (const s of allSales) {
    const t = new Date(s.sold_at).getTime();
    if (t < cutoff30) continue;
    const day = Math.floor(t / 86400000) * 86400000;
    volByDay.set(day, (volByDay.get(day) ?? 0) + 1);
  }
  const volPoints = Array.from(volByDay.entries())
    .map(([ts, count]) => ({ ts, count }))
    .sort((a, b) => a.ts - b.ts);

  // Grade distribution
  const gradeCount = new Map<string, number>();
  for (const s of allSales) {
    const k = `${s.grader} ${s.grade_value}`;
    gradeCount.set(k, (gradeCount.get(k) ?? 0) + 1);
  }
  const gradeBars = Array.from(gradeCount.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Source mix
  const sourceCount = new Map<string, number>();
  for (const s of allSales) {
    sourceCount.set(s.source, (sourceCount.get(s.source) ?? 0) + 1);
  }
  const sourceBars = Array.from(sourceCount.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // Build compare candidates — top 12 other players by sales 30d
  const compareCandidatesRaw = allPlayers
    .filter((p) => p.slug !== slug)
    .sort((a, b) => b.sales_30d - a.sales_30d)
    .slice(0, 14);
  const compareCandidates = await Promise.all(
    compareCandidatesRaw.map(async (p) => ({
      slug: p.slug,
      name: p.name,
      sport: p.sport,
      spark: await getPlayerSparkline(p.slug, 30),
    })),
  );
  const last = spark30.at(-1)?.value ?? player.avg_psa10_30d ?? 0;
  const first = spark30.at(0)?.value ?? last;
  const change = last - first;
  const changePct = first > 0 ? change / first : 0;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {/* Breadcrumb --------------------------------------------------- */}
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">{player.name}</span>
      </nav>

      {/* Identity + headline ----------------------------------------- */}
      <div className="flex items-start justify-between gap-6 flex-wrap mb-2">
        <div className="flex items-start gap-4">
          <PlayerAvatar player={player.name} size={56} className="mt-1" />
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl text-fg leading-none">{player.name}</h1>
              <span className="text-sm text-muted">{player.sport}</span>
            </div>
            {bio ? (
              <p className="text-sm text-muted max-w-2xl">{bio}</p>
            ) : (
              <p className="text-sm text-muted-2">Bio not available.</p>
            )}
          </div>
        </div>
        {/* For a player, "add to watchlist/portfolio" only makes sense on a
            specific card. Default the action to the player's most-popular
            (highest-priced) card; user can also click into any variant. */}
        {(() => {
          const featuredId =
            [...player.cards]
              .map((c) => ({ c, a: analyticsByCard.get(c.id) }))
              .sort(
                (a, b) =>
                  (b.a?.psa10_vwap_30d_usd ?? 0) -
                  (a.a?.psa10_vwap_30d_usd ?? 0)
              )[0]?.c.id ?? player.cards[0]?.id;
          if (!featuredId) return null;
          return (
            <div className="flex items-center gap-2">
              <AddToggle cardId={featuredId} bucket="watchlist" />
              <AddToggle cardId={featuredId} bucket="portfolio" />
            </div>
          );
        })()}
      </div>

      {/* Price headline + tools (CLIENT) ------------------------------- */}
      <div className="mt-6">
        <PlayerView
          slug={slug}
          name={player.name}
          initialSpark={spark30}
          allSales={allSales}
          psa10Sales={psa10Sales}
          fallbackPrice={last}
        />
      </div>

      {/* Totality of cards summary ----------------------------------- */}
      {player.cards.length > 1 ? (
        <section className="mt-12 mb-6">
          <h2 className="text-lg font-semibold text-fg mb-3 flex items-center gap-2">
            Across all {player.cards.length} of {player.name}&apos;s cards
            <InfoTip k="variations" side="right" />
          </h2>
          {(() => {
            const psa10s = player.cards
              .map((c) => ({
                card: c,
                price: analyticsByCard.get(c.id)?.psa10_vwap_30d_usd ?? null,
                sales: analyticsByCard.get(c.id)?.sales_count_30d ?? 0,
              }))
              .filter((d) => d.price != null && d.price > 0) as {
              card: typeof player.cards[number];
              price: number;
              sales: number;
            }[];
            if (psa10s.length === 0) return null;
            const sorted = [...psa10s].sort((a, b) => a.price - b.price);
            const totalW = psa10s.reduce((s, d) => s + d.sales, 0);
            const weightedAvg =
              totalW > 0
                ? psa10s.reduce((s, d) => s + d.price * d.sales, 0) / totalW
                : psa10s.reduce((s, d) => s + d.price, 0) / psa10s.length;
            const naiveAvg =
              psa10s.reduce((s, d) => s + d.price, 0) / psa10s.length;
            const lowest = sorted[0];
            const highest = sorted[sorted.length - 1];
            const spread = highest.price / Math.max(lowest.price, 1);

            return (
              <div className="border border-border bg-panel grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border">
                <CardSpan
                  label="Volume-weighted avg"
                  tipKey="vwap_30d"
                  value={`$${weightedAvg.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`}
                  hint="weighted by sales volume"
                />
                <CardSpan
                  label="Simple avg"
                  value={`$${naiveAvg.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`}
                  hint="for reference"
                />
                <CardSpan
                  label="Cheapest variant"
                  value={`$${lowest.price.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`}
                  hint={lowest.card.set_name}
                />
                <CardSpan
                  label="Top variant"
                  value={`$${highest.price.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`}
                  hint={highest.card.set_name}
                />
                <CardSpan
                  label="Variant spread"
                  value={`${spread.toFixed(0)}×`}
                  hint="top vs cheapest"
                />
              </div>
            );
          })()}
        </section>
      ) : null}

      {/* Featured cards ---------------------------------------------- */}
      {(() => {
        const cardsWithAnalytics = player.cards.map((c) => {
          const a = analyticsByCard.get(c.id);
          return {
            id: c.id,
            player_name: c.player_name,
            set_name: c.set_name,
            release_year: c.release_year,
            release_name: c.release_name,
            card_number: c.card_number,
            is_rookie: c.is_rookie,
            image_url: c.image_url ?? undefined,
            psa10_30d: a?.psa10_vwap_30d_usd ?? null,
            sales_30d: a?.sales_count_30d ?? null,
            momentum: a?.momentum_score ?? null,
          };
        });
        const featured = [...cardsWithAnalytics]
          .filter((c) => c.psa10_30d != null && c.psa10_30d > 0)
          .sort((a, b) => (b.psa10_30d ?? 0) - (a.psa10_30d ?? 0))
          .slice(0, 12)
          .map((c) => ({
            id: c.id,
            player_name: c.player_name,
            set_name: c.set_name,
            release_year: c.release_year,
            release_name: c.release_name,
            card_number: c.card_number,
            is_rookie: c.is_rookie,
            image_url: c.image_url,
            price: c.psa10_30d,
          }));

        return (
          <>
            {featured.length > 0 ? (
              <section className="mb-10">
                <h2 className="text-lg font-semibold text-fg mb-1 flex items-center gap-2">
                  <Star size={16} className="text-accent" />
                  Featured cards
                </h2>
                <p className="text-[12px] text-muted mb-4">
                  Highest-value variants by PSA 10 30-day average. The cards
                  most people are looking for.
                </p>
                <FeaturedCards items={featured} />
              </section>
            ) : null}

            {/* Full catalog — grouped Year → Brand → Set ------------ */}
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-fg mb-1 flex items-center gap-2">
                Full catalog
                <span className="text-sm font-normal text-muted">
                  ({player.cards.length})
                </span>
                <InfoTip k="variations" side="right" />
              </h2>
              <p className="text-[12px] text-muted mb-3">
                Every {player.name} card we track. Grouped by year and release.
                Click a year to expand, then a release to see its sets.
              </p>
              <VariantsList cards={cardsWithAnalytics} />
            </section>
          </>
        );
      })()}

      {/* Compare overlay --------------------------------------------- */}
      <div className="mb-10">
        <CompareSection
          primary={{
            slug,
            name: player.name,
            sport: player.sport,
            spark: spark30,
          }}
          candidates={compareCandidates}
        />
      </div>

      {/* Insights row: volume + grade + source breakdowns -------------- */}
      <section className="mb-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-border bg-panel p-4">
          <h3 className="text-sm font-semibold text-fg mb-1 flex items-center gap-2">
            <BarChart3 size={14} className="text-fg-2" />
            Daily volume · 30d
          </h3>
          <p className="text-[11px] text-muted mb-3">Count of PSA + BGS sales per day.</p>
          <VolumeBar points={volPoints} height={72} />
          <div className="mt-3 text-[11px] text-muted-2 flex items-center justify-between font-mono">
            <span>Total: {allSales.length} sales · 5 mo</span>
            <span>Peak day: {Math.max(0, ...volPoints.map((p) => p.count))} sales</span>
          </div>
        </div>

        <div className="border border-border bg-panel p-4">
          <h3 className="text-sm font-semibold text-fg mb-1 flex items-center gap-2">
            <Layers size={14} className="text-fg-2" />
            Grade distribution
          </h3>
          <p className="text-[11px] text-muted mb-3">All-time PSA + BGS sales by grade tier.</p>
          <HBars items={gradeBars.map((g) => ({
            ...g,
            tone: g.label.includes("PSA 10") ? "up" : g.label.includes("BGS") ? "muted" : g.label.includes("PSA 9") ? "accent" : "muted",
          }))} />
        </div>

        <div className="border border-border bg-panel p-4">
          <h3 className="text-sm font-semibold text-fg mb-1 flex items-center gap-2">
            <BarChart3 size={14} className="text-fg-2" />
            Sale source mix
          </h3>
          <p className="text-[11px] text-muted mb-3">Where the sales hit, all-time.</p>
          <HBars items={sourceBars.map((s) => ({ ...s, tone: "muted" }))} />
        </div>
      </section>

      {/* News + recent sales side-by-side on wide -------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <section>
          <h2 className="text-lg font-semibold text-fg mb-3 flex items-center gap-2">
            <Newspaper size={16} className="text-fg-2" />
            News {news.length > 0 ? <span className="text-sm font-normal text-muted">({news.length})</span> : null}
          </h2>
          {news.length === 0 ? (
            <div className="border border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
              No news for {player.name} right now.
            </div>
          ) : (
            <div className="border border-border bg-panel divide-y divide-border">
              {news.map((n) => (
                <article key={n.id} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted">
                      {n.source}
                    </span>
                    <span className="text-[11px] font-mono tabular text-muted-2">
                      {new Date(n.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-fg leading-snug">
                    {n.headline}
                  </h3>
                  <p className="mt-1 text-[12px] text-muted leading-snug">
                    {n.snippet}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <Section
            eyebrow="Recent sales · PSA + BGS"
            title={`Last ${Math.min(recent.length, 12)}`}
          />
          {recent.length === 0 ? (
            <div className="border border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
              No sales tracked yet.
            </div>
          ) : (
            <div className="border border-border bg-panel">
              <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b border-border bg-panel-2 eyebrow">
                <div className="col-span-3">Date</div>
                <div className="col-span-3">Grade</div>
                <div className="col-span-3">Source</div>
                <div className="col-span-3 text-right">Price</div>
              </div>
              {recent.slice(0, 12).map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-12 gap-3 px-4 py-2.5 text-sm border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150"
                >
                  <div className="col-span-3 font-mono text-muted tabular text-[12px]">
                    {new Date(s.sold_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="col-span-3 font-mono text-fg">
                    {s.grader} {s.grade_value}
                  </div>
                  <div className="col-span-3 text-[12px]">
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
                  <div className="col-span-3 text-right font-mono text-fg tabular">
                    ${s.price_usd.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CardSpan({
  label,
  value,
  hint,
  tipKey,
}: {
  label: string;
  value: string;
  hint?: string;
  tipKey?: Parameters<typeof InfoTip>[0]["k"];
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] text-muted font-mono uppercase tracking-[0.06em] inline-flex items-center gap-1.5">
        {label}
        {tipKey ? <InfoTip k={tipKey} side="bottom" /> : null}
      </div>
      <div className="mt-1.5 font-mono text-base text-fg tabular">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-2 truncate">{hint}</div>
      ) : null}
    </div>
  );
}
