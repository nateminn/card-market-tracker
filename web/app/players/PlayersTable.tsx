"use client";

// Player directory - search + sport filter + sortable columns + column-toggle
// dropdown. Headers are now ColumnSwitchers: each can swap its underlying
// metric or time window, and the choice persists per-table in localStorage.

import { useMemo, useState } from "react";
import Link from "next/link";
import Sparkline from "@/components/charts/Sparkline";
import ChangeBadge from "@/components/ui/ChangeBadge";
import Pill from "@/components/ui/Pill";
import PlayerAvatar from "@/components/ui/PlayerAvatar";
import { clsx } from "@/components/ui/clsx";
import ColumnsControl, {
  useColumns,
  type ColumnDef,
} from "@/components/ui/ColumnsControl";
import ColumnSwitcher, { useStoredValue } from "@/components/ui/ColumnSwitcher";
import type { Player } from "@/lib/data";

type Row = Player & {
  spark_7d: { ts: number; value: number }[];
  spark_30d: { ts: number; value: number }[];
  spark_90d: { ts: number; value: number }[];
};

type SortKey =
  | "name"
  | "sport"
  | "avg_psa10"
  | "alt_avg"
  | "sales"
  | "momentum"
  | "cards";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Player",
  sport: "Sport",
  avg_psa10: "Avg PSA 10",
  alt_avg: "Alt avg",
  sales: "Sales",
  momentum: "Momentum",
  cards: "Variants",
};

const COLUMNS: ColumnDef[] = [
  { id: "player", label: "Player", pinned: true },
  { id: "spark", label: "Sparkline", default: true },
  { id: "avg_psa10", label: "Avg PSA 10", default: true },
  { id: "alt_avg", label: "Alt window", default: false },
  { id: "sales", label: "Sales", default: true },
  { id: "cards", label: "# Variants", default: true },
  { id: "sport", label: "Sport", default: false },
  { id: "momentum", label: "Momentum", default: true },
];

const SPORTS = ["All", "Baseball", "Basketball", "Football"] as const;

// ColumnSwitcher option sets ----------------------------------------------

const PSA10_METRIC_OPTIONS = [
  { id: "weighted", label: "Volume-weighted (30d)" },
  { id: "simple", label: "Simple mean (30d)" },
  { id: "median", label: "Median (30d)" },
  { id: "weighted_90", label: "Volume-weighted (90d)" },
] as const;
type Psa10Metric = (typeof PSA10_METRIC_OPTIONS)[number]["id"];
const PSA10_METRIC_IDS = PSA10_METRIC_OPTIONS.map((o) => o.id);

const WINDOW_OPTIONS = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
] as const;
type Window = (typeof WINDOW_OPTIONS)[number]["id"];
const WINDOW_IDS = WINDOW_OPTIONS.map((o) => o.id);

const MOMENTUM_OPTIONS = [
  { id: "7v30", label: "7d vs 30d" },
  { id: "30v90", label: "30d vs 90d" },
] as const;
type MomentumKind = (typeof MOMENTUM_OPTIONS)[number]["id"];
const MOMENTUM_IDS = MOMENTUM_OPTIONS.map((o) => o.id);

// -------------------------------------------------------------------------

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}

export default function PlayersTable({ data }: { data: Row[] }) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("avg_psa10");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { visible, toggle, reset, reorder, ordered } = useColumns(
    COLUMNS,
    "cardex.cols.players.v2"
  );

  // Per-column user choices (localStorage-backed)
  const [psa10Metric, setPsa10Metric] = useStoredValue<Psa10Metric>(
    "cardex.col.players.psa10",
    "weighted",
    PSA10_METRIC_IDS
  );
  const [altWindow, setAltWindow] = useStoredValue<Window>(
    "cardex.col.players.alt",
    "7",
    WINDOW_IDS
  );
  const [salesWindow, setSalesWindow] = useStoredValue<Window>(
    "cardex.col.players.sales",
    "30",
    WINDOW_IDS
  );
  const [sparkWindow, setSparkWindow] = useStoredValue<Window>(
    "cardex.col.players.spark",
    "30",
    WINDOW_IDS
  );
  const [momKind, setMomKind] = useStoredValue<MomentumKind>(
    "cardex.col.players.momentum",
    "7v30",
    MOMENTUM_IDS
  );

  // Resolve a row's PSA 10 average given the chosen metric.
  const resolvePsa10 = (p: Row): number | null => {
    switch (psa10Metric) {
      case "weighted":
        return p.avg_psa10_30d;
      case "simple":
        return p.avg_psa10_simple;
      case "median":
        return p.avg_psa10_median;
      case "weighted_90":
        return p.avg_psa10_90d;
    }
  };
  const resolveAltAvg = (p: Row): number | null => {
    switch (altWindow) {
      case "7":
        return p.avg_psa10_7d;
      case "30":
        return p.avg_psa10_30d;
      case "90":
        return p.avg_psa10_90d_simple ?? p.avg_psa10_90d;
    }
  };
  const resolveSales = (p: Row): number => {
    switch (salesWindow) {
      case "7":
        return p.sales_7d;
      case "30":
        return p.sales_30d;
      case "90":
        return p.sales_90d;
    }
  };
  const resolveSpark = (p: Row): { ts: number; value: number }[] => {
    switch (sparkWindow) {
      case "7":
        return p.spark_7d;
      case "30":
        return p.spark_30d;
      case "90":
        return p.spark_90d;
    }
  };
  const resolveMomentum = (p: Row): number | null => {
    return momKind === "7v30" ? p.momentum : p.momentum_30v90;
  };

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let rows = data;
    if (sport !== "All") rows = rows.filter((p) => p.sport === sport);
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sport.toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case "name":
          av = a.name;
          bv = b.name;
          break;
        case "sport":
          av = a.sport;
          bv = b.sport;
          break;
        case "avg_psa10":
          av = resolvePsa10(a) ?? -1;
          bv = resolvePsa10(b) ?? -1;
          break;
        case "alt_avg":
          av = resolveAltAvg(a) ?? -1;
          bv = resolveAltAvg(b) ?? -1;
          break;
        case "sales":
          av = resolveSales(a);
          bv = resolveSales(b);
          break;
        case "momentum":
          av = resolveMomentum(a) ?? -999;
          bv = resolveMomentum(b) ?? -999;
          break;
        case "cards":
          av = a.cards.length;
          bv = b.cards.length;
          break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, sport, sortKey, sortDir, psa10Metric, altWindow, salesWindow, momKind]);

  const cycleSort = (k: SortKey) => {
    if (sortKey !== k) {
      setSortKey(k);
      setSortDir("desc");
    } else {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  };

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div>
      {/* Toolbar -------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[240px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
            className="cdx-input w-full h-9"
          />
        </div>
        <div className="flex items-center gap-2">
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
        <ColumnsControl
          columns={ordered}
          visible={visible}
          onToggle={toggle}
          onReset={reset}
          onReorder={reorder}
        />
      </div>

      {/* Table - flex columns so visibility stays clean. Wrapped in
          horizontal scroll so the column-rich layout stays usable on mobile
          without sacrificing density on desktop. */}
      <div className="border border-border bg-panel overflow-x-auto">
        <div className="min-w-[640px]">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-panel-2 eyebrow">
          <button
            type="button"
            onClick={() => cycleSort("name")}
            className="flex-1 min-w-0 text-left hover:text-fg transition-colors duration-150"
          >
            Player
            <span className="text-fg-2">{arrow("name")}</span>
          </button>
          {visible.has("sport") ? (
            <button
              type="button"
              onClick={() => cycleSort("sport")}
              className="w-20 text-left hover:text-fg transition-colors duration-150"
            >
              Sport
              <span className="text-fg-2">{arrow("sport")}</span>
            </button>
          ) : null}
          {visible.has("spark") ? (
            <div className="w-32 hidden md:flex items-center justify-start">
              <ColumnSwitcher
                options={WINDOW_OPTIONS as unknown as { id: Window; label: string }[]}
                value={sparkWindow}
                onChange={setSparkWindow}
              />
            </div>
          ) : null}
          {visible.has("avg_psa10") ? (
            <div className="w-32 text-right inline-flex items-center justify-end">
              <ColumnSwitcher
                options={PSA10_METRIC_OPTIONS as unknown as { id: Psa10Metric; label: string }[]}
                value={psa10Metric}
                onChange={setPsa10Metric}
                onSortToggle={() => cycleSort("avg_psa10")}
                sortIndicator={arrow("avg_psa10")}
                align="right"
              />
            </div>
          ) : null}
          {visible.has("alt_avg") ? (
            <div className="w-24 text-right inline-flex items-center justify-end">
              <ColumnSwitcher
                options={WINDOW_OPTIONS as unknown as { id: Window; label: string }[]}
                value={altWindow}
                onChange={setAltWindow}
                onSortToggle={() => cycleSort("alt_avg")}
                sortIndicator={arrow("alt_avg")}
                align="right"
              />
            </div>
          ) : null}
          {visible.has("sales") ? (
            <div className="w-20 text-right inline-flex items-center justify-end">
              <ColumnSwitcher
                options={WINDOW_OPTIONS as unknown as { id: Window; label: string }[]}
                value={salesWindow}
                onChange={setSalesWindow}
                onSortToggle={() => cycleSort("sales")}
                sortIndicator={arrow("sales")}
                align="right"
              />
            </div>
          ) : null}
          {visible.has("cards") ? (
            <button
              type="button"
              onClick={() => cycleSort("cards")}
              className="w-16 text-right hover:text-fg transition-colors duration-150"
            >
              Variants
              <span className="text-fg-2">{arrow("cards")}</span>
            </button>
          ) : null}
          {visible.has("momentum") ? (
            <div className="w-28 text-right inline-flex items-center justify-end">
              <ColumnSwitcher
                options={MOMENTUM_OPTIONS as unknown as { id: MomentumKind; label: string }[]}
                value={momKind}
                onChange={setMomKind}
                onSortToggle={() => cycleSort("momentum")}
                sortIndicator={arrow("momentum")}
                align="right"
              />
            </div>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-fg">No players match.</p>
            <p className="mt-1.5 text-[12px] text-muted">
              Try clearing the search, picking a different sport, or removing the price filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSport("All");
              }}
              className="mt-4 text-[12px] text-accent hover:text-fg transition-colors duration-150"
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map((p) => (
            <Link
              key={p.slug}
              href={`/players/${p.slug}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-panel-2 transition-colors duration-150"
            >
              <PlayerAvatar player={p.name} size={28} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-fg truncate">{p.name}</span>
                  {p.is_rookie ? <Pill tone="up">RC</Pill> : null}
                </div>
              </div>
              {visible.has("sport") ? (
                <div className="w-20 text-[12px] text-muted">{p.sport}</div>
              ) : null}
              {visible.has("spark") ? (
                <div className="w-32 hidden md:block">
                  <Sparkline points={resolveSpark(p)} width={120} height={24} />
                </div>
              ) : null}
              {visible.has("avg_psa10") ? (
                <div className="w-32 text-right font-mono text-sm tabular text-fg">
                  {fmtUsd(resolvePsa10(p))}
                </div>
              ) : null}
              {visible.has("alt_avg") ? (
                <div className="w-24 text-right font-mono text-sm tabular text-fg-2">
                  {fmtUsd(resolveAltAvg(p))}
                </div>
              ) : null}
              {visible.has("sales") ? (
                <div className="w-20 text-right font-mono text-sm tabular text-fg-2">
                  {resolveSales(p)}
                </div>
              ) : null}
              {visible.has("cards") ? (
                <div className="w-16 text-right font-mono text-sm tabular text-muted">
                  {p.cards.length}
                </div>
              ) : null}
              {visible.has("momentum") ? (
                <div className="w-28 text-right">
                  <ChangeBadge pct={resolveMomentum(p)} size="sm" />
                </div>
              ) : null}
            </Link>
          ))
        )}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-2 text-right">
        {filtered.length} of {data.length} players
      </div>
    </div>
  );
}
