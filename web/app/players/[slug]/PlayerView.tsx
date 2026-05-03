"use client";

// Client-side controls for the player detail chart:
//   - Time range tabs (1W / 1M / 3M / YTD / 1Y / ALL)
//   - Grade tier pills (All graded / PSA 10 / PSA 9 / BGS)
//   - Stats grid + change badge respect the selected window
//
// Each filter recomputes the displayed metrics in the browser. Mock data is
// small enough; a real implementation would push this to the server.

import { useEffect, useMemo, useState } from "react";
import ChangeBadge from "@/components/ui/ChangeBadge";
import InfoTip, { DEFINITIONS } from "@/components/ui/InfoTip";
import PortfolioLine from "@/components/charts/PortfolioLine";
import PriceChart from "@/components/charts/PriceChart";
import type { Sale } from "@/lib/data";

const RANGES = [
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "YTD", days: 115 }, // mock — Apr 25 ~ day 115 of year
  { id: "1Y", days: 150 }, // we only have 5mo of data; cap effectively
  { id: "ALL", days: 150 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const TIERS = [
  { id: "all", label: "All graded" },
  { id: "psa10", label: "PSA 10" },
  { id: "psa9", label: "PSA 9" },
  { id: "bgs", label: "BGS only" },
] as const;
type TierId = (typeof TIERS)[number]["id"];

const CHART_VARIANTS = [
  { id: "line", label: "Line" },
  { id: "bars", label: "Bars" },
] as const;
type ChartVariant = (typeof CHART_VARIANTS)[number]["id"] | "area";

const FILL_KEY = "cardex.chart.fill";

type Props = {
  slug: string;
  name: string;
  initialSpark: { ts: number; value: number }[];
  allSales: Sale[];
  psa10Sales: Sale[];
  fallbackPrice: number;
};

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

export default function PlayerView({
  name,
  allSales,
  psa10Sales,
  fallbackPrice,
}: Props) {
  const [range, setRange] = useState<RangeId | "custom">("1M");
  const [tier, setTier] = useState<TierId>("psa10");
  const [chartVariant, setChartVariant] = useState<ChartVariant>("line");
  const [filled, setFilled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FILL_KEY);
      if (stored != null) setFilled(stored === "1");
    } catch {
      // ignore
    }
  }, []);

  const onFillChange = (next: boolean) => {
    setFilled(next);
    try {
      window.localStorage.setItem(FILL_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  // PortfolioLine accepts "area" as line+gradient; translate the toggle.
  const effectiveVariant: ChartVariant =
    chartVariant === "line" && filled ? "area" : chartVariant;
  // Custom date range — only used when range === "custom"
  const NOW_MS = Date.UTC(2026, 3, 26);
  const isoFromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const [customFrom, setCustomFrom] = useState(
    isoFromMs(NOW_MS - 30 * 86400 * 1000)
  );
  const [customTo, setCustomTo] = useState(isoFromMs(NOW_MS));

  const filteredSales = useMemo(() => {
    let pool = allSales;
    if (tier === "psa10") pool = psa10Sales;
    else if (tier === "psa9")
      pool = allSales.filter(
        (s) => s.grader === "PSA" && String(s.grade_value) === "9"
      );
    else if (tier === "bgs") pool = allSales.filter((s) => s.grader === "BGS");

    if (range === "custom") {
      const fromMs = new Date(customFrom).getTime();
      const toMs = new Date(customTo).getTime() + 86400 * 1000; // inclusive
      return pool.filter((s) => {
        const t = new Date(s.sold_at).getTime();
        return t >= fromMs && t < toMs;
      });
    }
    const days = RANGES.find((r) => r.id === range)!.days;
    const cutoff = Date.UTC(2026, 3, 26) - days * 86400 * 1000;
    return pool.filter((s) => new Date(s.sold_at).getTime() >= cutoff);
  }, [allSales, psa10Sales, range, tier, customFrom, customTo]);

  // Daily VWAP for the chart line
  const sparkPoints = useMemo(() => {
    const byDay = new Map<number, number[]>();
    for (const s of filteredSales) {
      const day = Math.floor(new Date(s.sold_at).getTime() / 86400000) * 86400000;
      const list = byDay.get(day) ?? [];
      list.push(s.price_usd);
      byDay.set(day, list);
    }
    return Array.from(byDay.entries())
      .map(([ts, prices]) => ({
        ts,
        value: prices.reduce((a, b) => a + b, 0) / prices.length,
      }))
      .sort((a, b) => a.ts - b.ts);
  }, [filteredSales]);

  const last = sparkPoints.at(-1)?.value ?? fallbackPrice;
  const first = sparkPoints.at(0)?.value ?? last;
  const changeAbs = last - first;
  const changePct = first > 0 ? changeAbs / first : 0;

  const stats = useMemo(() => {
    const prices = filteredSales.map((s) => s.price_usd);
    if (prices.length === 0) {
      return {
        avg: null,
        median: null,
        min: null,
        max: null,
        count: 0,
      };
    }
    const sorted = [...prices].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const median = sorted[Math.floor(sorted.length / 2)];
    return {
      avg: sum / sorted.length,
      median,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: sorted.length,
    };
  }, [filteredSales]);

  return (
    <div>
      {/* Big number ---------------------------------------------------- */}
      <p className="text-sm text-muted mb-2 inline-flex items-center gap-2">
        Avg sale price
        <InfoTip k="vwap_30d" side="right" />
      </p>
      <div className="text-[44px] leading-none font-semibold tracking-tight text-fg">
        {fmtUsd(last)}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <ChangeBadge pct={changePct} abs={changeAbs} />
        <span className="text-sm text-muted">
          {range === "custom"
            ? `${customFrom} → ${customTo}`
            : RANGES.find((r) => r.id === range)?.id ?? ""}{" "}
          ·{" "}
          {tier === "all"
            ? "All graded"
            : tier === "psa10"
              ? "PSA 10 only"
              : tier === "psa9"
                ? "PSA 9 only"
                : "BGS only"}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-muted-2 inline-flex items-center gap-1.5">
        <InfoTip k="variations" side="bottom" />
        Average across all of {name}&apos;s graded sales for the selected window.
        Variations have different prices.
      </p>

      {/* Chart -------------------------------------------------------- */}
      <div className="mt-6 mb-3">
        <PortfolioLine points={sparkPoints} height={220} variant={effectiveVariant} />
      </div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="eyebrow">Chart type</span>
        {CHART_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={chartVariant === v.id}
            onClick={() => setChartVariant(v.id)}
            className="pill"
          >
            {v.label}
          </button>
        ))}
        {chartVariant === "line" ? (
          <button
            type="button"
            aria-pressed={filled}
            onClick={() => onFillChange(!filled)}
            className="pill"
            title="Show gradient under the line"
          >
            Fill
          </button>
        ) : null}
      </div>

      {/* Range pills + tier pills ------------------------------------- */}
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
              className="timetab"
            >
              {r.id}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={range === "custom"}
            onClick={() => setRange("custom")}
            className="timetab"
          >
            CUSTOM
          </button>
        </div>
        {range === "custom" ? (
          <div className="flex items-center gap-1.5 text-[12px]">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-7 px-2 bg-panel-2 border border-border rounded-[2px] text-fg-2 font-mono text-[11px] focus:outline-none focus:border-accent/40"
            />
            <span className="text-muted-2">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-7 px-2 bg-panel-2 border border-border rounded-[2px] text-fg-2 font-mono text-[11px] focus:outline-none focus:border-accent/40"
            />
          </div>
        ) : null}
        <span className="w-px h-5 bg-border" />
        <div className="flex items-center gap-2 flex-wrap">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tier === t.id}
              onClick={() => setTier(t.id)}
              className="pill"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Window stats grid ------------------------------------------- */}
      <div className="mt-8 border border-border bg-panel grid grid-cols-2 md:grid-cols-5 divide-y divide-x divide-border">
        <Stat
          label="Avg price"
          tipKey="vwap_30d"
          value={fmtUsd(stats.avg)}
        />
        <Stat
          label="Median"
          tipKey="vwap_30d"
          value={fmtUsd(stats.median)}
        />
        <Stat label="Low" tipKey="vwap_30d" value={fmtUsd(stats.min)} />
        <Stat label="High" tipKey="vwap_30d" value={fmtUsd(stats.max)} />
        <Stat
          label="Sales"
          tipKey="sales_30d"
          value={String(stats.count)}
        />
      </div>

      {/* Scatter chart ----------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-fg">Every sale</h2>
          <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-[0.08em] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-up" /> PSA 10
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-warn" /> PSA 9
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-info" /> BGS
            </span>
          </div>
        </div>
        <div className="border border-border bg-panel p-4">
          <PriceChart sales={filteredSales} />
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  tipKey,
  value,
}: {
  label: string;
  tipKey: keyof typeof DEFINITIONS;
  value: string;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-[11px] text-muted font-mono uppercase tracking-[0.06em] inline-flex items-center gap-1.5">
        {label}
        <InfoTip k={tipKey} side="bottom" />
      </div>
      <div className="mt-1.5 font-mono text-base text-fg tabular">{value}</div>
    </div>
  );
}
