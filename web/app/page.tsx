// Dashboard / "Investing" - Robinhood-style.
// Big page heading with portfolio-style summary, time tabs, big chart-as-line,
// trending categories as pills, news placeholder, top movers table.

import Link from "next/link";
import {
  getCounts,
  getGemPicks,
  getSparkline,
  getPortfolioValueLine,
  getBigTrades,
  getPlayers,
  getPlayerSparkline,
  type Player,
  type Sale,
  type Card,
} from "@/lib/data";
import { getTier } from "@/lib/tier";
import { NEWS } from "@/lib/news";
import ChangeBadge from "@/components/ui/ChangeBadge";
import TimeRangeTabs from "@/components/ui/TimeRangeTabs";
import PortfolioLine from "@/components/charts/PortfolioLine";
import Sparkline from "@/components/charts/Sparkline";
import InfoTip from "@/components/ui/InfoTip";
import CardImage from "@/components/ui/CardImage";
import {
  TrendingUp,
  TrendingDown,
  Newspaper,
  Sparkles,
  Activity,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export default async function Home() {
  // Fetch everything upfront in parallel.
  const [counts, players, indexLine, bigTrades, gemPicks, tier] = await Promise.all([
    getCounts(),
    getPlayers(),
    getPortfolioValueLine(30),
    getBigTrades(8),
    getGemPicks(),
    getTier(),
  ]);
  const isAnon = tier === "anon";

  const ranked = [...players]
    .filter((p) => p.momentum != null)
    .sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0));
  const up = ranked.slice(0, 5);
  const down = [...ranked].reverse().slice(0, 5);

  // Pre-resolve sparklines for every mover so render is sync below.
  const moverSparks = new Map<string, { ts: number; value: number }[]>();
  await Promise.all(
    [...up, ...down].map(async (p) => {
      moverSparks.set(p.slug, await getPlayerSparkline(p.slug, 30));
    }),
  );

  // Pre-resolve sparklines for the gem picks too.
  const pickSparks = new Map<string, { ts: number; value: number }[]>();
  await Promise.all(
    gemPicks.slice(0, 5).map(async (p) => {
      pickSparks.set(p.card_id, await getSparkline(p.card_id));
    }),
  );

  const first = indexLine.at(0)?.value ?? 0;
  const last = indexLine.at(-1)?.value ?? 0;
  const indexChange = first > 0 ? (last - first) / first : 0;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      {isAnon ? (
        <MarketingHero counts={counts} />
      ) : (
        <>
          {/* Headline ----------------------------------------------------- */}
          <div className="mb-2">
            <p className="text-sm text-muted mb-2 inline-flex items-center gap-2">
              My portfolio
              <InfoTip k="current_value" side="right" />
            </p>
            <h1 className="text-[44px] leading-none font-semibold tracking-tight text-fg">
              {fmtUsd(last)}
            </h1>
            <div className="mt-2 flex items-center gap-3">
              <ChangeBadge pct={indexChange} abs={(last - first) || null} />
              <span className="text-sm text-muted">Last 30 days</span>
            </div>
          </div>

          {/* Big chart ---------------------------------------------------- */}
          <div className="mt-6 mb-2">
            <PortfolioLine points={indexLine} height={240} />
          </div>
          <div className="mb-10">
            <TimeRangeTabs defaultValue="1M" />
          </div>
        </>
      )}

      {/* Index strip --------------------------------------------------- */}
      <section className="mb-10">
        <div className="border border-border bg-panel-2/40 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
          <IndexStat label="Cards tracked" value={counts.cards.toLocaleString()} pct={null} />
          <IndexStat label="Sales (5mo)" value={counts.sales.toLocaleString()} pct={null} />
          <IndexStat label="Watchlist" value={counts.watchlist.toLocaleString()} pct={null} />
        </div>
      </section>

      {/* Movers - by PLAYER, not by card --------------------------- */}
      <section className="mb-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlayerMoversTable
          title="Top gainers"
          subtitle="By player · 30 days"
          players={up}
          sparks={moverSparks}
          tone="up"
          icon={<TrendingUp size={16} className="text-up" />}
        />
        <PlayerMoversTable
          title="Top decliners"
          subtitle="By player · 30 days"
          players={down}
          sparks={moverSparks}
          tone="down"
          icon={<TrendingDown size={16} className="text-down" />}
        />
      </section>

      {/* Signal picks teaser ------------------------------------------- */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            Signal picks
          </h2>
          <Link href="/signal" className="text-sm text-muted hover:text-fg">
            Open Signal
          </Link>
        </div>
        <ScannerTeaser picks={gemPicks.slice(0, 5)} sparks={pickSparks} />
      </section>

      {/* Big trades --------------------------------------------------- */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Activity size={16} className="text-fg-2" />
            Big trades
          </h2>
          <span className="text-xs text-muted">Last 5 months · PSA + BGS</span>
        </div>
        <BigTradesTable trades={bigTrades} />
      </section>

      {/* News ---------------------------------------------------------- */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Newspaper size={16} className="text-fg-2" />
            In the market
          </h2>
          <span className="text-xs text-muted">Static feed · live integration TBD</span>
        </div>
        <NewsGrid />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (sync, take pre-resolved data as props)
// ---------------------------------------------------------------------------

function IndexStat({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number | null;
}) {
  return (
    <div className="px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <div className="font-mono text-xl text-fg tabular">{value}</div>
        {pct != null ? <ChangeBadge pct={pct} size="sm" /> : null}
      </div>
    </div>
  );
}

function PlayerMoversTable({
  title,
  subtitle,
  players,
  sparks,
  tone,
  icon,
}: {
  title: string;
  subtitle: string;
  players: Player[];
  sparks: Map<string, { ts: number; value: number }[]>;
  tone: "up" | "down";
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-muted">{subtitle}</span>
      </div>
      <div className="border border-border bg-panel divide-y divide-border">
        {players.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            No players with movement yet.
          </div>
        ) : (
          players.map((p) => {
            const spark = sparks.get(p.slug) || [];
            return (
              <Link
                key={p.slug}
                href={`/players/${p.slug}`}
                className="grid grid-cols-12 items-center gap-3 px-4 py-3 hover:bg-panel-2 transition-colors duration-150"
              >
                <div className="col-span-5 min-w-0">
                  <div className="text-sm text-fg truncate">{p.name}</div>
                  <div className="text-[11px] text-muted truncate mt-0.5">
                    {p.cards.length} card{p.cards.length === 1 ? "" : "s"} · {p.sport}
                  </div>
                </div>
                <div className="col-span-3">
                  <Sparkline points={spark} width={100} height={24} tone={tone} />
                </div>
                <div className="col-span-2 text-right font-mono text-sm tabular text-fg">
                  {fmtUsd(p.avg_psa10_30d)}
                </div>
                <div className="col-span-2 text-right">
                  <ChangeBadge pct={p.momentum} size="sm" />
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function BigTradesTable({ trades }: { trades: (Sale & { card: Card })[] }) {
  return (
    <div className="border border-border bg-panel divide-y divide-border">
      {/* Header row hidden on mobile - rows render label-free for narrow widths */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
        <div className="col-span-2">Date</div>
        <div className="col-span-4">Player · Card</div>
        <div className="col-span-2">Grade</div>
        <div className="col-span-2">Source</div>
        <div className="col-span-2 text-right">Sale price</div>
      </div>
      {trades.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">No big trades yet.</div>
      ) : (
        trades.map((s) => (
          <div
            key={s.id}
            className="flex sm:grid sm:grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-panel-2 transition-colors duration-150 text-sm"
          >
            <Link
              href={`/cards/${s.card.id}`}
              className="flex-1 sm:col-span-4 min-w-0 hover:text-accent transition-colors flex items-center gap-2 sm:order-2"
            >
              <CardImage
                src={s.card.image_url}
                player={s.card.player_name}
                alt={s.card.set_name}
                width={26}
              />
              <div className="min-w-0">
                <div className="text-fg-2 truncate">{s.card.player_name}</div>
                <div className="text-[11px] text-muted truncate">
                  {s.card.release_year} · {s.card.set_name}
                </div>
              </div>
            </Link>
            <div className="hidden sm:block sm:col-span-2 sm:order-1 font-mono text-muted tabular text-[12px]">
              {new Date(s.sold_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="hidden sm:block sm:col-span-2 sm:order-3 font-mono">
              {s.is_graded ? (
                <span className="text-fg">
                  {s.grader} {s.grade_value}
                </span>
              ) : (
                <span className="text-info">Raw</span>
              )}
            </div>
            <div className="hidden sm:block sm:col-span-2 sm:order-4 text-[12px]">
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
            <div className="w-20 sm:w-auto sm:col-span-2 sm:order-5 text-right font-mono text-fg tabular shrink-0">
              ${s.price_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function NewsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {NEWS.slice(0, 6).map((n) => (
        <article
          key={n.id}
          className="border border-border bg-panel hover:bg-panel-2 transition-colors duration-150 p-4"
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
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
            {n.cardId ? (
              <Link
                href={`/cards/${n.cardId}`}
                className="hover:text-accent transition-colors duration-150"
              >
                {n.headline}
              </Link>
            ) : (
              n.headline
            )}
          </h3>
          <p className="mt-1.5 text-[12px] text-muted leading-snug">
            {n.snippet}
          </p>
        </article>
      ))}
    </div>
  );
}

function ScannerTeaser({
  picks,
  sparks,
}: {
  picks: Awaited<ReturnType<typeof getGemPicks>>;
  sparks: Map<string, { ts: number; value: number }[]>;
}) {
  return (
    <div className="border border-border bg-panel divide-y divide-border">
      {picks.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">
          Signal picks will appear once analytics has data to score.
        </div>
      ) : (
        picks.map((p) => {
          const spark = sparks.get(p.card_id) || [];
          const last = spark.at(-1)?.value ?? 0;
          return (
            <Link
              key={p.card_id}
              href={`/cards/${p.card_id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2 transition-colors duration-150"
            >
              <div className="w-8 shrink-0 text-center font-mono text-xs text-muted tabular">
                {p.signal}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-fg truncate flex items-center gap-2">
                  {p.card.player_name}
                  {p.card.is_rookie ? (
                    <span className="text-[9px] font-mono text-up uppercase tracking-wider">
                      RC
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {p.card.release_year} {p.card.release_name} · {p.card.set_name}
                </div>
              </div>
              {/* Thesis: hidden below lg, takes up the middle on lg+ */}
              <div className="hidden lg:block flex-1 min-w-0 text-[11px] text-fg-2 leading-snug line-clamp-2">
                {p.thesis ?? <span className="text-muted">No thesis written.</span>}
              </div>
              {/* Sparkline: hidden on mobile */}
              <div className="hidden md:block w-20 shrink-0">
                <Sparkline points={spark} width={80} height={24} />
              </div>
              <div className="w-16 sm:w-20 shrink-0 text-right font-mono text-sm tabular text-fg">
                {fmtUsd(last)}
              </div>
              <div className="w-14 sm:w-16 shrink-0 text-right">
                <ChangeBadge pct={p.momentum_score} size="sm" />
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

function MarketingHero({
  counts,
}: {
  counts: Awaited<ReturnType<typeof getCounts>>;
}) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-accent" />
        <span className="eyebrow">Cardex</span>
      </div>
      <h1 className="text-3xl md:text-[56px] font-semibold tracking-tight text-fg leading-[1.02] max-w-3xl">
        The trading desk for sports cards.
      </h1>
      <p className="mt-5 text-base md:text-lg text-muted max-w-2xl leading-relaxed">
        Live sales, what&rsquo;s for sale right now, and an algorithmic pick
        list with a{" "}
        <Link
          href="/signal#how-signal-works"
          className="text-up font-medium hover:text-fg transition-colors"
        >
          +34% backtested edge
        </Link>{" "}
        over the universe median across 4 windows. Built for flippers, not
        scrapbookers.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          href="/signal"
          className="inline-flex items-center gap-1.5 px-5 h-11 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
        >
          See today&rsquo;s picks
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-1.5 px-5 h-11 border border-border text-fg font-medium text-sm hover:border-accent hover:text-accent transition-colors"
        >
          Create free account
        </Link>
        <span className="text-xs text-muted-2 ml-1">No credit card. Browse the whole market free.</span>
      </div>

      {/* Live numbers band - proof the data is real */}
      <dl className="mt-10 border-y border-border py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8">
        <Stat label="Cards tracked" value={counts.cards.toLocaleString()} />
        <Stat label="Sales (rolling)" value={counts.sales.toLocaleString()} />
        <Stat label="Signal edge" value="+34%" sub="vs median, backtested" />
        <Stat label="Refresh" value="6h" sub="auto" />
      </dl>

      {/* Three-up "what makes this different" - comparison-aware */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Pillar
          title="Sold AND active, side-by-side"
          desc="Most sites show historical sold prices. We show what just sold AND what's available to buy right now - same card, same view. Decision-time data, not retrospective."
        />
        <Pillar
          title="Algorithmic, not editorial"
          desc="Signal scores every graded card 0–100 across momentum, sample density, and confidence. We publish the methodology and the rolling backtest. No anonymous panel of 'experts'."
        />
        <Pillar
          title="Built for tempo"
          desc="Dense, dark, fast. Filter by sport, price band, parallel. Drill from a player to a card to a single sale in three clicks. No collector fluff, no paywalled lookups."
        />
      </div>

      <h2 className="mt-14 mb-2 text-2xl font-semibold tracking-tight text-fg">
        What&rsquo;s moving in the market
      </h2>
      <p className="mb-6 text-sm text-muted">
        Live data from PSA + BGS sales, refreshed every 6 hours. Free to
        browse - no sign-in required.
      </p>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-2">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular text-fg leading-none">
        {value}
      </dd>
      {sub ? (
        <span className="mt-1 block text-[11px] text-muted-2 font-mono">
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function Pillar({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border border-border bg-panel p-5">
      <h3 className="text-base font-semibold text-fg mb-1.5">{title}</h3>
      <p className="text-[13px] text-muted leading-relaxed">{desc}</p>
    </div>
  );
}
