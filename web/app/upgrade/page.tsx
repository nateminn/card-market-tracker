// /upgrade - Pro upgrade page. Stripe is not yet wired; the CTA shows a
// "Coming soon" toast. The page is intentionally short - the marketing copy
// for Pro is on /signal (where the wall sits) so users see what they unlock.

import Link from "next/link";
import { Sparkles, Check } from "lucide-react";
import { getTier } from "@/lib/tier";
import UpgradeButton from "./UpgradeButton";

export const dynamic = "force-dynamic";

const PRO_FEATURES = [
  "Full Signal Engine pick list - every scored card, refreshed daily",
  "Watchlist alerts when a card crosses your price target",
  "Deeper analytics: per-grade VWAP, scarcity, and gem-rate breakdowns",
  "Backtest tools - see how the engine has performed over time",
  "CSV exports of any table",
  "Priority support",
];

export default async function UpgradePage() {
  const tier = await getTier();

  return (
    <div className="px-6 lg:px-10 py-12 max-w-3xl mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Upgrade</span>
      </nav>

      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={18} className="text-accent" />
        <span className="eyebrow">Cardex Pro</span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-fg leading-tight">
        Trade with the same edge we use ourselves.
      </h1>
      <p className="mt-3 text-sm text-muted max-w-xl leading-relaxed">
        The free tier is a market explorer. Pro is a working trading desk -
        Signal picks, alerts, backtests, exports. Cancel any time.
      </p>

      <div className="mt-8 border border-border bg-panel p-6">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight text-fg">
            $19.99
          </span>
          <span className="text-sm text-muted">/ month</span>
        </div>
        <ul className="mt-5 space-y-2.5">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm text-fg-2">
              <Check size={16} className="text-up shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <UpgradeButton tier={tier} />
        </div>
        <p className="mt-3 text-[11px] text-muted-2">
          Billing is handled by Stripe. We never see your card details.
        </p>
      </div>

      <p className="mt-6 text-xs text-muted-2 leading-relaxed">
        Already a subscriber? Sign in and your Pro features will unlock
        automatically.
      </p>
    </div>
  );
}
