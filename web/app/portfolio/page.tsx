// Portfolio — collection-first view. Headline is total value of cards owned;
// individual trades are NOT entered here. With Supabase live: portfolio_trades
// is currently empty, so this page renders an empty state for now. Will fill
// in once we add user auth + a "verified portfolio" import flow.

import Link from "next/link";
import {
  getPortfolio,
  getPortfolioValueLine,
} from "@/lib/data";
import ChangeBadge from "@/components/ui/ChangeBadge";
import TimeRangeTabs from "@/components/ui/TimeRangeTabs";
import PortfolioLine from "@/components/charts/PortfolioLine";
import Button from "@/components/ui/Button";
import InfoTip from "@/components/ui/InfoTip";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export default async function PortfolioPage() {
  const [{ summary }, valueLine] = await Promise.all([
    getPortfolio(),
    getPortfolioValueLine(30),
  ]);
  const lastValue = valueLine.at(-1)?.value ?? summary.total_current_value_usd;
  const firstValue = valueLine.at(0)?.value ?? lastValue;
  const change = lastValue - firstValue;
  const changePct = firstValue > 0 ? change / firstValue : 0;

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Portfolio</span>
      </nav>

      <div className="flex items-start justify-between gap-6 flex-wrap mb-2">
        <div>
          <h1 className="text-2xl text-fg leading-none mb-3">My portfolio</h1>
          <div className="text-[44px] leading-none font-semibold tracking-tight text-fg">
            {fmtUsd(lastValue)}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ChangeBadge pct={changePct} abs={change} />
            <span className="text-sm text-muted">Last 30 days</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary">Export CSV</Button>
        </div>
      </div>

      <div className="mt-6 mb-2">
        <PortfolioLine points={valueLine} height={220} />
      </div>
      <div className="mb-10">
        <TimeRangeTabs defaultValue="1M" />
      </div>

      <div className="border border-border bg-panel-2/40 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border mb-10">
        <SummaryTile
          label="Cost basis"
          tipKey="invested"
          value={fmtUsd(summary.total_invested_usd)}
        />
        <SummaryTile
          label="Current value"
          tipKey="current_value"
          value={fmtUsd(summary.total_current_value_usd)}
        />
        <SummaryTile
          label="Unrealized P/L"
          tipKey="unrealized_pl"
          value={fmtUsd(summary.total_unrealized_pl_usd)}
          tone={summary.total_unrealized_pl_usd >= 0 ? "up" : "down"}
        />
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-fg mb-3">My collection</h2>
        <EmptyState
          title="No cards in your collection."
          description="Open any card and tap Add to portfolio."
        />
      </section>
    </div>
  );
}

import { DEFINITIONS } from "@/components/ui/InfoTip";

function SummaryTile({
  label,
  tipKey,
  value,
  tone = "default",
}: {
  label: string;
  tipKey: keyof typeof DEFINITIONS;
  value: string;
  tone?: "default" | "up" | "down";
}) {
  const cls =
    tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-fg";
  return (
    <div className="px-5 py-4">
      <div className="text-xs text-muted inline-flex items-center gap-1.5">
        {label}
        <InfoTip k={tipKey} side="bottom" />
      </div>
      <div className={`mt-1 font-mono text-xl tabular ${cls}`}>{value}</div>
    </div>
  );
}
