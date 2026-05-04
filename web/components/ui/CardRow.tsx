// Row of card data linking to /cards/[id].
//
// Uses the flat mock shape (release_year, set_name on the card itself).
// Numbers in mono. Hover reveals a subtle bg shift; selected rows get the
// accent-quiet background.

import Link from "next/link";
import Pill from "./Pill";
import { clsx } from "./clsx";
import type { AnalyticsRow, Card } from "@/lib/data";

function fmtUsd(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  if (n >= 1000) return `$${(Math.round(n / 100) / 10).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  const v = (n * 100).toFixed(1);
  return `${n >= 0 ? "+" : ""}${v}%`;
}

type Props = {
  card: Card;
  analytics?: AnalyticsRow | null;
  selected?: boolean;
};

export default function CardRow({ card, analytics, selected }: Props) {
  const momentum = analytics?.momentum_score ?? null;
  const momentumColor =
    momentum === null
      ? "text-muted"
      : momentum > 0.005
        ? "text-up"
        : momentum < -0.005
          ? "text-down"
          : "text-muted";

  return (
    <Link
      href={`/cards/${card.id}`}
      className={clsx(
        "block group focus:outline-none focus-visible:bg-panel-2",
        "transition-colors duration-150 ease-[cubic-bezier(0.25,1,0.5,1)]"
      )}
    >
      <div
        className={clsx(
          "grid grid-cols-12 gap-4 items-center px-4 py-3.5 border-b border-border last:border-b-0",
          "hover:bg-panel-2 group-focus-visible:bg-panel-2",
          selected && "bg-accent-quiet"
        )}
      >
        {/* Identity --------------------------------------------------- */}
        <div className="col-span-12 md:col-span-5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-fg group-hover:text-accent transition-colors duration-150 truncate">
              {card.player_name}
            </span>
            {card.is_rookie ? <Pill tone="up">RC</Pill> : null}
          </div>
          <div className="mt-0.5 text-[12px] text-muted font-mono truncate">
            {card.release_year} {card.release_name} · {card.set_name} · #{card.card_number}
          </div>
        </div>

        {/* 30d sales ---------------------------------------------------- */}
        <div className="col-span-3 md:col-span-2 text-right">
          <div className="md:hidden eyebrow">30d</div>
          <div className="font-mono text-sm tabular text-fg">
            {analytics?.sales_count_30d ?? 0}
          </div>
        </div>

        {/* VWAP 30d ---------------------------------------------------- */}
        <div className="col-span-3 md:col-span-2 text-right">
          <div className="md:hidden eyebrow">VWAP 30d</div>
          <div className="font-mono text-sm tabular text-fg">
            {fmtUsd(analytics?.vwap_30d_usd)}
          </div>
        </div>

        {/* PSA 10 ----------------------------------------------------- */}
        <div className="col-span-3 md:col-span-2 text-right">
          <div className="md:hidden eyebrow">PSA 10</div>
          <div className="font-mono text-sm tabular text-fg-2">
            {fmtUsd(analytics?.psa10_vwap_30d_usd)}
          </div>
        </div>

        {/* Momentum ---------------------------------------------------- */}
        <div className="col-span-3 md:col-span-1 text-right">
          <div className="md:hidden eyebrow">Mom</div>
          <div className={clsx("font-mono text-sm tabular", momentumColor)}>
            {fmtPct(momentum)}
          </div>
        </div>
      </div>
    </Link>
  );
}
