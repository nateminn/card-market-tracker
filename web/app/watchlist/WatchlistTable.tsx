"use client";

// Watchlist table - combines seeded mock rows with user-added card_ids from
// localStorage. The displayed list is (seededRows ∪ rows for user-added ids
// that aren't already seeded). User can also remove a row via the AddToggle
// in each row.

import { useMemo } from "react";
import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import ChangeBadge from "@/components/ui/ChangeBadge";
import Pill from "@/components/ui/Pill";
import InfoTip from "@/components/ui/InfoTip";
import CardImage from "@/components/ui/CardImage";
import AddToggle from "@/components/ui/AddToggle";
import EmptyState from "@/components/ui/EmptyState";
import { useWatchlist } from "@/lib/userState";
import ColumnsControl, {
  useColumns,
  type ColumnDef,
} from "@/components/ui/ColumnsControl";
import ColumnSwitcher, {
  useStoredValue,
} from "@/components/ui/ColumnSwitcher";

export type Row = {
  card_id: string;
  player_name: string;
  card_subtitle: string; // e.g. "2024 Topps Chrome · Base Set · #202"
  release_year: string;
  is_rookie: boolean;
  image_url: string | null;
  added_at: string;
  notes: string | null;
  target_buy_usd: number | null;
  target_sell_usd: number | null;
  vwap_30d_usd: number | null;
  vwap_7d_usd: number | null;
  vwap_90d_usd: number | null;
  psa10_30d_usd: number | null;
  psa9_90d_usd: number | null;
  psa10_to_psa9_multiple: number | null;
  momentum: number | null;
  sales_30d: number | null;
  spark: { ts: number; value: number }[];
};

const COLUMNS: ColumnDef[] = [
  { id: "card", label: "Player · Card", pinned: true },
  { id: "spark", label: "30d sparkline", default: true },
  { id: "vwap", label: "VWAP", default: true },
  { id: "psa10", label: "PSA 10 30d", default: true },
  { id: "psa10_psa9", label: "PSA 10 / 9", default: false },
  { id: "sales", label: "Sales", default: false },
  { id: "target_buy", label: "Target buy", default: false },
  { id: "target_sell", label: "Target sell", default: false },
  { id: "added", label: "Added", default: false },
  { id: "momentum", label: "Momentum", default: true },
];

const WINDOW_OPTIONS = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
] as const;
type Window = (typeof WINDOW_OPTIONS)[number]["id"];
const WINDOW_IDS = WINDOW_OPTIONS.map((o) => o.id);

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

function daysSince(iso: string): number {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)
  );
}

export default function WatchlistTable({
  seededRows,
  otherRows,
}: {
  seededRows: Row[];
  otherRows: Row[];
}) {
  const { visible, toggle, reset } = useColumns(COLUMNS, "cardex.cols.watchlist.v2");
  const watchlist = useWatchlist();
  const [vwapWindow, setVwapWindow] = useStoredValue<Window>(
    "cardex.col.watchlist.vwap",
    "30",
    WINDOW_IDS
  );

  // Final rows = seeded + user-added (excluding any already in seeded).
  const rows = useMemo(() => {
    const seededIds = new Set(seededRows.map((r) => r.card_id));
    const extras = otherRows.filter(
      (r) => watchlist.has(r.card_id) && !seededIds.has(r.card_id)
    );
    return [...seededRows, ...extras];
  }, [seededRows, otherRows, watchlist]);

  const totalValue = rows.reduce(
    (s, r) => s + (r.psa10_30d_usd ?? r.vwap_30d_usd ?? 0),
    0
  );

  // Target alerts: a row is "buy" if current price <= target_buy, "sell" if
  // current price >= target_sell. We use the PSA 10 30d as the "current" price
  // since target_buy/target_sell are entered against PSA 10 valuations.
  function alertFor(r: Row): "buy" | "sell" | null {
    const cur = r.psa10_30d_usd ?? r.vwap_30d_usd;
    if (cur == null) return null;
    if (r.target_buy_usd != null && cur <= r.target_buy_usd) return "buy";
    if (r.target_sell_usd != null && cur >= r.target_sell_usd) return "sell";
    return null;
  }
  const alertCount = rows.filter((r) => alertFor(r) != null).length;

  const fmtUsdHero = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
    return `$${n.toFixed(2)}`;
  };

  const resolveVwap = (r: Row): number | null => {
    switch (vwapWindow) {
      case "7":
        return r.vwap_7d_usd;
      case "30":
        return r.vwap_30d_usd;
      case "90":
        return r.vwap_90d_usd;
    }
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h1 className="text-2xl text-fg leading-none">Watchlist</h1>
          {alertCount > 0 ? (
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-up bg-up/10 border border-up/40 px-2 py-0.5 rounded-full">
              {alertCount} {alertCount === 1 ? "target hit" : "targets hit"}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          {rows.length} {rows.length === 1 ? "card" : "cards"} · approx PSA 10
          value{" "}
          <span className="text-fg-2 font-mono tabular">
            {fmtUsdHero(totalValue)}
          </span>
        </p>
      </div>

      <div className="flex items-center justify-end mb-3">
        <ColumnsControl
          columns={COLUMNS}
          visible={visible}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing on the watchlist."
          description="Use Signal to find candidates, then tap Add to watchlist on any card."
          action={
            <Link
              href="/signal"
              className="inline-flex items-center gap-1.5 px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              Open Signal →
            </Link>
          }
        />
      ) : (
      <div className="border border-border bg-panel overflow-x-auto">
        <div className="min-w-[640px]">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
          <div className="flex-1 min-w-0">Player · Card</div>
          {visible.has("spark") ? <div className="w-32 hidden md:block">30d</div> : null}
          {visible.has("vwap") ? (
            <div className="w-24 text-right inline-flex items-center justify-end gap-1">
              <ColumnSwitcher
                options={WINDOW_OPTIONS as unknown as { id: Window; label: string }[]}
                value={vwapWindow}
                onChange={setVwapWindow}
                align="right"
              />
              <InfoTip k="vwap_30d" side="left" />
            </div>
          ) : null}
          {visible.has("psa10") ? (
            <div className="w-24 text-right inline-flex items-center justify-end gap-1.5">
              PSA 10 30d <InfoTip k="psa10_30d" side="left" />
            </div>
          ) : null}
          {visible.has("psa10_psa9") ? (
            <div className="w-20 text-right inline-flex items-center justify-end gap-1.5">
              10/9× <InfoTip k="psa10_to_psa9" side="left" />
            </div>
          ) : null}
          {visible.has("sales") ? (
            <div className="w-16 text-right">Sales 30d</div>
          ) : null}
          {visible.has("target_buy") ? <div className="w-20 text-right">Tgt buy</div> : null}
          {visible.has("target_sell") ? <div className="w-20 text-right">Tgt sell</div> : null}
          {visible.has("added") ? <div className="w-16 text-right">Added</div> : null}
          {visible.has("momentum") ? (
            <div className="w-24 text-right inline-flex items-center justify-end gap-1.5">
              Momentum <InfoTip k="momentum" side="left" />
            </div>
          ) : null}
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
                {(() => {
                  const a = alertFor(r);
                  if (a === "buy") {
                    return (
                      <span
                        title={`Below buy target (${r.target_buy_usd != null ? `$${r.target_buy_usd}` : ""})`}
                        className="text-[9px] font-mono uppercase tracking-wider text-up bg-up/10 border border-up/40 px-1.5 py-0.5"
                      >
                        Buy
                      </span>
                    );
                  }
                  if (a === "sell") {
                    return (
                      <span
                        title={`At or above sell target (${r.target_sell_usd != null ? `$${r.target_sell_usd}` : ""})`}
                        className="text-[9px] font-mono uppercase tracking-wider text-warn bg-warn/10 border border-warn/40 px-1.5 py-0.5"
                      >
                        Sell
                      </span>
                    );
                  }
                  return null;
                })()}
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
            {visible.has("vwap") ? (
              <div className="w-24 text-right font-mono text-sm tabular text-fg">
                {fmtUsd(resolveVwap(r))}
              </div>
            ) : null}
            {visible.has("psa10") ? (
              <div className="w-24 text-right font-mono text-sm tabular text-fg-2">
                {fmtUsd(r.psa10_30d_usd)}
              </div>
            ) : null}
            {visible.has("psa10_psa9") ? (
              <div className="w-20 text-right font-mono text-sm tabular text-fg-2">
                {r.psa10_to_psa9_multiple != null
                  ? `${r.psa10_to_psa9_multiple.toFixed(2)}×`
                  : "-"}
              </div>
            ) : null}
            {visible.has("sales") ? (
              <div className="w-16 text-right font-mono text-sm tabular text-muted">
                {r.sales_30d ?? 0}
              </div>
            ) : null}
            {visible.has("target_buy") ? (
              <div className="w-20 text-right font-mono text-[12px] tabular text-muted">
                {fmtUsd(r.target_buy_usd)}
              </div>
            ) : null}
            {visible.has("target_sell") ? (
              <div className="w-20 text-right font-mono text-[12px] tabular text-muted">
                {fmtUsd(r.target_sell_usd)}
              </div>
            ) : null}
            {visible.has("added") ? (
              <div className="w-16 text-right font-mono text-[11px] text-muted-2">
                {daysSince(r.added_at)}d
              </div>
            ) : null}
            {visible.has("momentum") ? (
              <div className="w-24 text-right">
                <ChangeBadge pct={r.momentum} size="sm" />
              </div>
            ) : null}
            <div className="w-7 flex items-center justify-end">
              <AddToggle cardId={r.card_id} bucket="watchlist" compact />
            </div>
          </Link>
        ))}
        </div>
      </div>
      )}
    </div>
  );
}
