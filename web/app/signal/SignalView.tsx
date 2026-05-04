"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Pill from "@/components/ui/Pill";
import Sparkline from "@/components/charts/Sparkline";
import ChangeBadge from "@/components/ui/ChangeBadge";
import { clsx } from "@/components/ui/clsx";
import ColumnsControl, {
  useColumns,
  type ColumnDef,
} from "@/components/ui/ColumnsControl";
import type { AnalyticsRow, Card } from "@/lib/data";

type Pick = AnalyticsRow & {
  card: Card;
  signal: number;
  spark: { ts: number; value: number }[];
};

const SPORTS = ["All", "Baseball", "Basketball", "Football"] as const;
const CONFIDENCE: { value: AnalyticsRow["confidence"]; label: string }[] = [
  { value: "insufficient", label: "Any" },
  { value: "low", label: "Low+" },
  { value: "medium", label: "Medium+" },
  { value: "high", label: "High only" },
];
const PRICE_RANGES = [
  { label: "All", min: 0, max: Infinity },
  { label: "<$50", min: 0, max: 50 },
  { label: "$50–250", min: 50, max: 250 },
  { label: "$250–1k", min: 250, max: 1000 },
  { label: "$1k+", min: 1000, max: Infinity },
];

const CONF_RANK = { insufficient: 0, low: 1, medium: 2, high: 3 } as const;

const SIGNAL_COLUMNS: ColumnDef[] = [
  { id: "sig", label: "Signal score", pinned: true },
  { id: "card", label: "Player · Card", pinned: true },
  { id: "thesis", label: "Thesis", default: true },
  { id: "spark", label: "30d sparkline", default: true },
  { id: "vwap", label: "VWAP 30d", default: true },
  { id: "psa10", label: "PSA 10 30d", default: false },
  { id: "sales", label: "Sales 30d", default: false },
  { id: "sport", label: "Sport", default: false },
  { id: "year", label: "Release year", default: false },
  { id: "confidence", label: "Confidence", default: true },
  { id: "momentum", label: "Momentum", default: true },
];

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export default function SignalView({ picks }: { picks: Pick[] }) {
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("All");
  const [priceIdx, setPriceIdx] = useState(0);
  const [confidence, setConfidence] = useState<AnalyticsRow["confidence"]>("insufficient");
  const cols = useColumns(SIGNAL_COLUMNS, "cardex.cols.signal");

  const filtered = useMemo(() => {
    const range = PRICE_RANGES[priceIdx];
    return picks.filter((p) => {
      if (sport !== "All" && p.card.sport !== sport) return false;
      const v30 = p.vwap_30d_usd ?? 0;
      if (v30 < range.min || v30 > range.max) return false;
      const c = p.confidence ?? "insufficient";
      const target = confidence ?? "insufficient";
      if (CONF_RANK[c] < CONF_RANK[target]) return false;
      return true;
    });
  }, [picks, sport, priceIdx, confidence]);

  const onReset = () => {
    setSport("All");
    setPriceIdx(0);
    setConfidence("insufficient");
  };

  return (
    <div>
      {/* Filter pills row -------------------------------------------- */}
      <div className="mb-3 flex flex-wrap gap-2">
        {SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sport === s}
            onClick={() => setSport(s)}
            className="pill"
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {PRICE_RANGES.map((r, i) => (
          <button
            key={r.label}
            type="button"
            aria-pressed={priceIdx === i}
            onClick={() => setPriceIdx(i)}
            className="pill"
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2 items-center">
        {CONFIDENCE.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={confidence === c.value}
            onClick={() => setConfidence(c.value)}
            className="pill"
          >
            {c.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="text-sm text-muted hover:text-fg transition-colors"
          >
            Reset
          </button>
          <ColumnsControl
            columns={SIGNAL_COLUMNS}
            visible={cols.visible}
            onToggle={cols.toggle}
            onReset={cols.reset}
          />
        </div>
      </div>

      {/* Table -------------------------------------------------------- */}
      <div className="border border-border bg-panel">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
          <div className="w-10 sm:w-12 text-center shrink-0">Sig</div>
          <div className="flex-1 min-w-0">Player · Card</div>
          {cols.visible.has("thesis") ? (
            <div className="flex-1 min-w-0 hidden lg:block">Thesis</div>
          ) : null}
          {cols.visible.has("spark") ? <div className="w-32 hidden md:block">30d</div> : null}
          {cols.visible.has("vwap") ? <div className="w-20 text-right hidden md:block">VWAP 30d</div> : null}
          {cols.visible.has("psa10") ? <div className="w-20 text-right hidden md:block">PSA 10</div> : null}
          {cols.visible.has("sales") ? <div className="w-16 text-right hidden md:block">Sales 30d</div> : null}
          {cols.visible.has("sport") ? <div className="w-20 text-right hidden md:block">Sport</div> : null}
          {cols.visible.has("year") ? <div className="w-16 text-right hidden md:block">Year</div> : null}
          {cols.visible.has("confidence") ? <div className="w-20 text-right hidden md:block">Conf</div> : null}
          {cols.visible.has("momentum") ? <div className="w-16 sm:w-24 text-right shrink-0">Momentum</div> : null}
        </div>
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted">
            No picks match. Loosen a filter.
          </div>
        ) : (
          filtered.map((p) => (
            <Link
              key={p.card_id}
              href={`/cards/${p.card_id}`}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150"
            >
              <div className="w-10 sm:w-12 text-center font-mono text-xs text-muted tabular shrink-0">
                {p.signal}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-fg truncate">
                    {p.card.player_name}
                  </span>
                  {p.card.is_rookie ? <Pill tone="up">RC</Pill> : null}
                </div>
                <div className="mt-0.5 text-[11px] text-muted truncate">
                  {p.card.release_year} {p.card.release_name} · {p.card.set_name}
                </div>
              </div>
              {cols.visible.has("thesis") ? (
                <div className="flex-1 min-w-0 hidden lg:block">
                  <div className="text-sm text-fg-2 leading-snug line-clamp-2">
                    {p.thesis ?? <span className="text-muted">No thesis written.</span>}
                  </div>
                </div>
              ) : null}
              {cols.visible.has("spark") ? (
                <div className="w-32 hidden md:block">
                  <Sparkline points={p.spark} width={120} height={28} />
                </div>
              ) : null}
              {cols.visible.has("vwap") ? (
                <div className="w-20 text-right font-mono text-sm tabular text-fg hidden md:block">
                  {fmtUsd(p.vwap_30d_usd)}
                </div>
              ) : null}
              {cols.visible.has("psa10") ? (
                <div className="w-20 text-right font-mono text-sm tabular text-fg-2 hidden md:block">
                  {fmtUsd(p.psa10_vwap_30d_usd)}
                </div>
              ) : null}
              {cols.visible.has("sales") ? (
                <div className="w-16 text-right font-mono text-sm tabular text-muted hidden md:block">
                  {p.sales_count_30d ?? 0}
                </div>
              ) : null}
              {cols.visible.has("sport") ? (
                <div className="w-20 text-right text-[12px] text-muted hidden md:block">
                  {p.card.sport}
                </div>
              ) : null}
              {cols.visible.has("year") ? (
                <div className="w-16 text-right font-mono text-[11px] text-muted-2 hidden md:block">
                  {p.card.release_year}
                </div>
              ) : null}
              {cols.visible.has("confidence") ? (
                <div
                  className={clsx(
                    "w-20 text-right text-[10px] font-mono uppercase tracking-wider hidden md:block",
                    p.confidence === "high"
                      ? "text-up"
                      : p.confidence === "insufficient"
                        ? "text-muted-2"
                        : "text-muted"
                  )}
                >
                  {p.confidence}
                </div>
              ) : null}
              {cols.visible.has("momentum") ? (
                <div className="w-16 sm:w-24 text-right shrink-0">
                  <ChangeBadge pct={p.momentum_score} size="sm" />
                </div>
              ) : null}
            </Link>
          ))
        )}
      </div>
      <div className="mt-2 text-xs text-muted-2 text-right">
        {filtered.length} of {picks.length} cards
      </div>
    </div>
  );
}
