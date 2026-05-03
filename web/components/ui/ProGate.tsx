// ProGate — server component that wraps Pro-only content.
//
// Behaviour:
//   - Pro user → renders children unchanged.
//   - Free user (or signed-out) → renders an upgrade wall with a CTA.
//
// Usage:
//   <ProGate tier={tier}>
//     <FullSignalTable picks={picks} />
//   </ProGate>
//
// For partial reveals (show first 3 picks, then wall), pass a `teaser` prop —
// it renders above the wall.

import Link from "next/link";
import { Sparkles, Lock } from "lucide-react";
import type { Tier } from "@/lib/tier";

type Props = {
  tier: Tier;
  children: React.ReactNode;
  teaser?: React.ReactNode;
  /** Headline shown on the wall (default: generic "Unlock Pro"). */
  headline?: string;
  /** Sub-text on the wall. */
  subhead?: string;
};

export default function ProGate({
  tier,
  children,
  teaser,
  headline = "Unlock the full Signal Engine.",
  subhead = "Pro shows every scored card, refreshes every 6h, and includes alerts + exports.",
}: Props) {
  if (tier === "pro") return <>{children}</>;

  return (
    <div>
      {teaser ? (
        <div className="relative">
          {teaser}
          {/* fade-out gradient so the teaser softly bleeds into the wall */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-bg"
          />
        </div>
      ) : null}

      <div className="mt-6 border border-border bg-panel p-6 md:p-8">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={14} className="text-accent" />
          <span className="eyebrow">Pro feature</span>
        </div>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-fg leading-tight max-w-xl">
          {headline}
        </h2>
        <p className="mt-2 text-sm text-muted max-w-xl leading-relaxed">
          {subhead}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link
            href={tier === "anon" ? "/auth/signup?next=/upgrade" : "/upgrade"}
            className="inline-flex items-center gap-1.5 px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
          >
            <Sparkles size={14} />
            {tier === "anon" ? "Sign up to upgrade" : "Upgrade to Pro"}
          </Link>
          <span className="text-xs text-muted-2">
            $19.99 / month · cancel any time
          </span>
        </div>
      </div>
    </div>
  );
}
