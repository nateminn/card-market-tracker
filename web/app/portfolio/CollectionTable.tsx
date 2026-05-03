"use client";

// Portfolio "My collection" table — combines seeded positions with the user's
// localStorage-saved card_ids. User-added cards have no cost basis (they
// didn't enter what they paid), so cost-related cells show "—".

import { useMemo } from "react";
import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import ChangeBadge from "@/components/ui/ChangeBadge";
import Pill from "@/components/ui/Pill";
import InfoTip from "@/components/ui/InfoTip";
import CardImage from "@/components/ui/CardImage";
import AddToggle from "@/components/ui/AddToggle";
import EmptyState from "@/components/ui/EmptyState";
import { usePortfolio } from "@/lib/userState";
import ColumnsControl, {
  useColumns,
  type ColumnDef,
} from "@/components/ui/ColumnsControl";

export type Row = {
  card_id: string;
  player_name: string;
  card_subtitle: string;
  is_rookie: boolean;
  image_url: string | null;
  open_qty: number;
  avg_buy_usd: number | null;
  fair_per_unit: number;
  cost_basis: number | null;
  market_value: number;
  unrealized_pl: number | null;
  pct_return: number | null;
  hold_days: number | null;
  release_year: string;
  spark: { ts: number; value: number }[];
};

const COLUMNS: ColumnDef[] = [
  { id: "card", label: "Player · Card", pinned: true },
  { id: "spark", label: "30d sparkline", default: true },
  { id: "qty", label: "Quantity", default: true },
  { id: "avg_buy", label: "Avg buy", default: true },
  { id: "cost_basis", label: "Cost basis", default: false },
  { id: "fair_per_unit", label: "Fair / unit", default: false },
  { id: "mkt_value", label: "Market value", default: true },
  { id: "held", label: "Held (days)", default: true },
  { id: "year", label: "Release year", default: false },
  { id: "pl", label: "Unrealized P/L", default: true },
  { id: "roi", label: "ROI %", default: true },
];

function fmtUsd(n: number | null) {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

function tone(n: number | null) {
  if (n == null) return "text-muted";
  if (n > 0.005) return "text-up";
  if (n < -0.005) return "text-down";
  return "text-muted";
}

export default function CollectionTable({
  seededRows,
  otherRows,
}: {
  seededRows: Row[];
  otherRows: Row[];
}) {
  const { visible, toggle, reset } = useColumns(
    COLUMNS,
    "cardex.cols.portfolio.owned"
  );
  const portfolio = usePortfolio();

  const rows = useMemo(() => {
    const seededIds = new Set(seededRows.map((r) => r.card_id));
    const extras = otherRows.filter(
      (r) => portfolio.has(r.card_id) && !seededIds.has(r.card_id)
    );
    return [...seededRows, ...extras];
  }, [seededRows, otherRows, portfolio]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No cards in your collection."
        description="Open any card and tap Add to portfolio."
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <ColumnsControl
          columns={COLUMNS}
          visible={visible}
          onToggle={toggle}
          onReset={reset}
        />
      </div>
      <div className="border border-border bg-panel overflow-x-auto">
        <div className="min-w-[640px]">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
          <div className="flex-1 min-w-0">Player · Card</div>
          {visible.has("spark") ? <div className="w-32 hidden md:block">30d</div> : null}
          {visible.has("qty") ? (
            <div className="w-16 text-right inline-flex items-center justify-end gap-1.5">
              Qty <InfoTip k="qty" side="left" />
            </div>
          ) : null}
          {visible.has("avg_buy") ? (
            <div className="w-20 text-right inline-flex items-center justify-end gap-1.5">
              Avg buy <InfoTip k="avg_buy" side="left" />
            </div>
          ) : null}
          {visible.has("cost_basis") ? <div className="w-20 text-right">Basis</div> : null}
          {visible.has("fair_per_unit") ? <div className="w-20 text-right">Fair/u</div> : null}
          {visible.has("mkt_value") ? (
            <div className="w-20 text-right inline-flex items-center justify-end gap-1.5">
              Mkt val <InfoTip k="mkt_value" side="left" />
            </div>
          ) : null}
          {visible.has("held") ? (
            <div className="w-16 text-right inline-flex items-center justify-end gap-1.5">
              Held <InfoTip k="held" side="left" />
            </div>
          ) : null}
          {visible.has("year") ? <div className="w-16 text-right">Year</div> : null}
          {visible.has("pl") ? (
            <div className="w-24 text-right inline-flex items-center justify-end gap-1.5">
              Unreal P/L <InfoTip k="unrealized_pl" side="left" />
            </div>
          ) : null}
          {visible.has("roi") ? <div className="w-16 text-right">ROI</div> : null}
          <div className="w-7" />
        </div>

        {rows.map((r) => (
          <Link
            key={r.card_id}
            href={`/cards/${r.card_id}`}
            className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150"
          >
            <CardImage src={r.image_url ?? undefined} player={r.player_name} alt={r.card_subtitle} width={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm text-fg truncate">{r.player_name}</span>
                {r.is_rookie ? <Pill tone="up">RC</Pill> : null}
              </div>
              <div className="mt-0.5 text-[11px] text-muted truncate">
                {r.card_subtitle}
              </div>
            </div>
            {visible.has("spark") ? (
              <div className="w-32 hidden md:block">
                <Sparkline points={r.spark} width={120} height={26} />
              </div>
            ) : null}
            {visible.has("qty") ? (
              <div className="w-16 text-right font-mono text-sm tabular text-fg-2">
                {r.open_qty}
              </div>
            ) : null}
            {visible.has("avg_buy") ? (
              <div className="w-20 text-right font-mono text-sm tabular text-fg-2">
                {fmtUsd(r.avg_buy_usd)}
              </div>
            ) : null}
            {visible.has("cost_basis") ? (
              <div className="w-20 text-right font-mono text-sm tabular text-muted">
                {fmtUsd(r.cost_basis)}
              </div>
            ) : null}
            {visible.has("fair_per_unit") ? (
              <div className="w-20 text-right font-mono text-sm tabular text-fg-2">
                {fmtUsd(r.fair_per_unit)}
              </div>
            ) : null}
            {visible.has("mkt_value") ? (
              <div className="w-20 text-right font-mono text-sm tabular text-fg">
                {fmtUsd(r.market_value)}
              </div>
            ) : null}
            {visible.has("held") ? (
              <div className="w-16 text-right font-mono text-sm tabular text-muted">
                {r.hold_days != null ? `${r.hold_days}d` : "—"}
              </div>
            ) : null}
            {visible.has("year") ? (
              <div className="w-16 text-right font-mono text-[11px] text-muted-2">
                {r.release_year}
              </div>
            ) : null}
            {visible.has("pl") ? (
              <div className={`w-24 text-right font-mono text-sm tabular ${tone(r.unrealized_pl)}`}>
                {fmtUsd(r.unrealized_pl)}
              </div>
            ) : null}
            {visible.has("roi") ? (
              <div className="w-16 text-right">
                <ChangeBadge pct={r.pct_return} size="sm" />
              </div>
            ) : null}
            <div className="w-7 flex items-center justify-end">
              <AddToggle cardId={r.card_id} bucket="portfolio" compact />
            </div>
          </Link>
        ))}
        </div>
      </div>
    </div>
  );
}
