// /signal - Cardex Signal Engine.
// Pitched as a proprietary algorithm that ranks underrated cards using a
// composite of momentum, volume density, scarcity, and analyst-coded thesis.
// This page is the differentiator. The model is opaque on purpose; the UI
// shows component breakdowns so users see WHY each pick scored where it did.

import Link from "next/link";
import { getGemPicks, getSparkline } from "@/lib/data";
import SignalView from "./SignalView";
import InfoTip from "@/components/ui/InfoTip";
import ProGate from "@/components/ui/ProGate";
import { getTier } from "@/lib/tier";
import { Sparkles, TrendingUp, ShieldCheck, Database } from "lucide-react";

export const dynamic = "force-dynamic";

const FREE_PREVIEW = 3;

export default async function SignalPage() {
  const [picks, tier] = await Promise.all([getGemPicks(), getTier()]);
  const picksWithSpark = await Promise.all(
    picks.map(async (p) => ({
      ...p,
      spark: await getSparkline(p.card.id),
    })),
  );
  const visiblePicks =
    tier === "pro" ? picksWithSpark : picksWithSpark.slice(0, FREE_PREVIEW);

  const total = picks.length;
  const high = picks.filter((p) => p.confidence === "high").length;
  const positive = picks.filter((p) => (p.momentum_score ?? 0) > 0).length;
  const avgSignal =
    picks.length > 0
      ? Math.round(
          picks.reduce((s, p) => s + p.signal, 0) / picks.length
        )
      : 0;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Signal</span>
      </nav>

      {/* Hero - compact -------------------------------------------------
          Was previously a full-page explainer with 4 factor cards taking
          ~500px above the fold. Most repeat visitors don't need that
          re-explained on every visit. The full breakdown lives at the
          bottom of the page now ("How Signal works") for first-time
          discovery, with a small inline "Learn more" anchor here. */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={18} className="text-accent" />
          <span className="eyebrow">Cardex Signal Engine</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-fg leading-tight max-w-3xl">
          Graded cards trading above their statistical baseline.
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          Composite score (0–100) across four factors: momentum, sample density,
          confidence, and thesis.{" "}
          <a
            href="#how-signal-works"
            className="text-accent hover:text-fg transition-colors duration-150"
          >
            How it works ↓
          </a>
        </p>
      </section>

      {/* Topline numbers --------------------------------------------- */}
      <section className="mb-10 border-y border-border py-4">
        <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm">
          <Stat label="Cards scored" value={String(total)} tipKey={null} />
          <Stat
            label="High-confidence"
            value={`${high}`}
            sub="of cards scored"
            tipKey="confidence"
          />
          <Stat
            label="Positive 7d momentum"
            value={`${positive}`}
            sub="of cards scored"
            tipKey="momentum"
          />
          <Stat
            label="Avg signal score"
            value={`${avgSignal}`}
            sub="of 100"
            tipKey="signal_score"
          />
          <Stat
            label="Last refresh"
            value="2 min ago"
            tipKey={null}
            sub="auto every 6h"
          />
        </dl>
      </section>

      {/* Picks table -------------------------------------------------- */}
      <h2 className="text-lg font-semibold text-fg mb-3 flex items-center gap-2">
        Today&apos;s picks
        <span className="text-sm font-normal text-muted">
          {tier === "pro"
            ? `(${total})`
            : `(${FREE_PREVIEW} of ${total} - Pro shows all)`}
        </span>
      </h2>
      <ProGate
        tier={tier}
        teaser={<SignalView picks={visiblePicks} />}
        headline={`See all ${total} Signal picks.`}
        subhead="Free preview shows the top 3. Pro unlocks the full ranked list, alerts when a card crosses your target, and CSV exports."
      >
        <SignalView picks={picksWithSpark} />
      </ProGate>

      {/* How Signal works - full breakdown moved out of the hero ------ */}
      <section id="how-signal-works" className="mt-16 pt-10 border-t border-border scroll-mt-20">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-accent" />
          <span className="eyebrow">How Signal works</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg leading-tight max-w-3xl mb-3">
          A proprietary model that flags graded cards mispriced by the market
          - before they catch.
        </h2>
        <p className="text-sm text-muted max-w-2xl leading-relaxed mb-6">
          Signal scores every PSA + BGS-graded card in the catalog on a 0–100
          scale by combining four orthogonal factors. It looks for cards
          trading above their statistical baseline, with sample density to
          back the move, and a written thesis pinned to a real on-field
          development. Nothing here is financial advice; this is what we use
          ourselves.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <FactorCard
            num={1}
            label="Momentum"
            tone="up"
            weight="35%"
            desc="7-day VWAP vs. 30-day VWAP. Captures the velocity of recent buyer enthusiasm."
            icon={<TrendingUp size={14} />}
          />
          <FactorCard
            num={2}
            label="Sample density"
            weight="25%"
            desc="Number of PSA + BGS sales in the last 90 days. Filters out moves built on a single transaction."
            icon={<Database size={14} />}
          />
          <FactorCard
            num={3}
            label="Confidence"
            weight="25%"
            desc="Weighted variance and recency of the underlying sales. High = tight + recent. Insufficient = drop the pick."
            icon={<ShieldCheck size={14} />}
          />
          <FactorCard
            num={4}
            label="Thesis"
            weight="15%"
            tone="accent"
            desc="Analyst-coded reason the card is on the radar today: an on-field development, a comparable, a structural anomaly."
            icon={<Sparkles size={14} />}
          />
        </div>
      </section>

      {/* Disclaimer --------------------------------------------------- */}
      <p className="mt-8 text-[12px] text-muted-2 max-w-3xl leading-relaxed">
        Cardex Signal is a screening tool, not a recommendation. Past
        movement is not a guarantee of future returns. Trading-card markets
        are illiquid and prone to fad cycles. Every pick should be
        cross-checked against your own thesis before committing capital.
      </p>
    </div>
  );
}

import { DEFINITIONS } from "@/components/ui/InfoTip";

function FactorCard({
  num,
  label,
  desc,
  weight,
  tone,
  icon,
}: {
  num: number;
  label: string;
  desc: string;
  weight: string;
  tone?: "up" | "accent";
  icon: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.08em] ${
            tone === "up"
              ? "text-up"
              : tone === "accent"
                ? "text-accent"
                : "text-muted"
          }`}
        >
          {icon}
          Factor {num}
        </span>
        <span className="text-[11px] font-mono text-muted-2">{weight}</span>
      </div>
      <h3 className="text-base font-semibold text-fg mb-1">{label}</h3>
      <p className="text-[12px] text-muted leading-snug">{desc}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tipKey,
}: {
  label: string;
  value: string;
  sub?: string;
  tipKey: keyof typeof DEFINITIONS | null;
}) {
  return (
    <div className="inline-flex items-baseline gap-1.5">
      <dt className="text-muted">
        {label}
        {tipKey ? <InfoTip k={tipKey} side="bottom" className="ml-1" /> : null}
      </dt>
      <dd className="font-mono tabular text-fg">{value}</dd>
      {sub ? (
        <span className="text-xs text-muted-2 font-mono">{sub}</span>
      ) : null}
    </div>
  );
}
