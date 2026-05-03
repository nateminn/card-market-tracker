"use client";

// Price scatter — PSA + BGS only. Each dot is a sale. The accent line is a
// 10-sale rolling mean. Custom tooltip avoids Recharts' default behaviour of
// rendering the X-axis (ts) value as a dollar number.

import {
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

type Sale = {
  sold_at: string;
  price_usd: number;
  is_graded: boolean;
  grader: string | null;
  grade_value: string | null;
};

function bucketOf(s: Sale): "psa10" | "psa9" | "psa8-or-less" | "bgs" | "raw" {
  // Raw (ungraded) gets its own bucket so on raw-heavy or raw-only cards
  // the dots actually render in a visible colour instead of being lumped
  // into the muted "psa8-or-less" pile.
  if (!s.is_graded) return "raw";
  if (s.grader === "BGS") return "bgs";
  const g = String(s.grade_value);
  if (g === "10") return "psa10";
  if (g === "9") return "psa9";
  return "psa8-or-less";
}

function dotShape(props: { cx?: number; cy?: number; fill?: string }) {
  const { cx, cy, fill } = props;
  if (cx == null || cy == null) return <g />;
  return <circle cx={cx} cy={cy} r={2.5} fill={fill} />;
}

function rollingMean(points: { ts: number; price: number }[], window = 10) {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  return sorted.map((p, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    const mean =
      slice.reduce((a, b) => a + b.price, 0) / Math.max(slice.length, 1);
    return { ts: p.ts, vwap: Number(mean.toFixed(2)) };
  });
}

const COLOR_PSA10 = "oklch(78% 0.20 145)"; // bright neon green
const COLOR_PSA9 = "oklch(75% 0.14 80)";   // saffron
const COLOR_PSA_LOW = "oklch(60% 0.005 250)"; // muted
const COLOR_BGS = "oklch(70% 0.10 240)";   // info blue
const COLOR_RAW = "oklch(72% 0.13 200)";   // cyan-teal — distinct from BGS
const COLOR_VWAP = "oklch(82% 0.16 80)";   // accent
const COLOR_GRID = "oklch(20% 0.008 250)";
const COLOR_AXIS = "oklch(60% 0.006 250)";

// Recharts' tooltip types vary across versions; using `any` here is
// pragmatic — the runtime contract (active + payload[]) is stable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip(props: any) {
  const { active, payload } = props;
  if (!active || !payload || payload.length === 0) return null;

  // Find a payload entry that has price (scatter or line). Some entries
  // duplicate; pick the first useful one.
  const sale = payload[0]?.payload as { ts?: number; price?: number; vwap?: number; grader?: string; grade_value?: string };
  if (!sale) return null;
  const ts = sale.ts ?? null;
  const price = sale.price ?? sale.vwap ?? null;
  const dateStr = ts
    ? new Date(ts).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  return (
    <div
      style={{
        background: "oklch(15% 0.007 250)",
        border: "1px solid oklch(28% 0.010 250)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "oklch(95% 0.005 250)",
        padding: "6px 10px",
      }}
    >
      <div style={{ marginBottom: 2 }}>{dateStr}</div>
      {price != null ? (
        <div>
          ${price.toFixed(2)}
          {sale.grader && sale.grade_value
            ? ` · ${sale.grader} ${sale.grade_value}`
            : sale.vwap != null
              ? " · VWAP-10"
              : ""}
        </div>
      ) : null}
    </div>
  );
}

export default function PriceChart({ sales }: { sales: Sale[] }) {
  // Plot everything we have — raw + graded across all known graders. Empty
  // graphs help nobody; the bucketing colour-codes the dots so the user can
  // tell raw from graded at a glance, and graded variations from each other.
  const filtered = sales.filter(
    (s) => Number.isFinite(Number(s.price_usd)) && Number(s.price_usd) > 0,
  );

  if (filtered.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted">
        No sales to chart yet.
      </div>
    );
  }

  const points = filtered.map((s) => ({
    ts: new Date(s.sold_at).getTime(),
    price: Number(s.price_usd),
    bucket: bucketOf(s),
    grader: s.grader,
    grade_value: s.grade_value,
  }));

  const vwap = rollingMean(
    points.map((p) => ({ ts: p.ts, price: p.price })),
    10
  );

  const raw = points.filter((p) => p.bucket === "raw");
  const psa10 = points.filter((p) => p.bucket === "psa10");
  const psa9 = points.filter((p) => p.bucket === "psa9");
  const psaLow = points.filter((p) => p.bucket === "psa8-or-less");
  const bgs = points.filter((p) => p.bucket === "bgs");

  const minTs = Math.min(...points.map((p) => p.ts));
  const maxTs = Math.max(...points.map((p) => p.ts));

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  const fmtUsd = (n: number) => `$${n.toFixed(0)}`;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 16, bottom: 28, left: 12 }}>
          <CartesianGrid stroke={COLOR_GRID} strokeDasharray="2 4" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={[minTs, maxTs]}
            tickFormatter={fmtDate}
            stroke={COLOR_AXIS}
            tick={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fill: COLOR_AXIS,
            }}
            tickLine={false}
            axisLine={{ stroke: COLOR_GRID }}
            label={{
              value: "Sale date",
              position: "insideBottom",
              offset: -16,
              style: {
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fill: COLOR_AXIS,
              },
            }}
          />
          <YAxis
            dataKey="price"
            type="number"
            tickFormatter={fmtUsd}
            stroke={COLOR_AXIS}
            tick={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fill: COLOR_AXIS,
            }}
            tickLine={false}
            axisLine={{ stroke: COLOR_GRID }}
            width={56}
            label={{
              value: "Sale price (USD)",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              style: {
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fill: COLOR_AXIS,
                textAnchor: "middle",
              },
            }}
          />
          <Tooltip
            content={CustomTooltip}
            cursor={{ stroke: COLOR_GRID, strokeDasharray: "2 2" }}
          />
          <Scatter
            name="Raw"
            data={raw}
            fill={COLOR_RAW}
            line={false}
            opacity={0.7}
            shape={dotShape}
            isAnimationActive={false}
          />
          <Scatter
            name="PSA 10"
            data={psa10}
            fill={COLOR_PSA10}
            line={false}
            opacity={0.85}
            shape={dotShape}
            isAnimationActive={false}
          />
          <Scatter
            name="PSA 9"
            data={psa9}
            fill={COLOR_PSA9}
            line={false}
            opacity={0.7}
            shape={dotShape}
            isAnimationActive={false}
          />
          <Scatter
            name="PSA <9"
            data={psaLow}
            fill={COLOR_PSA_LOW}
            line={false}
            opacity={0.5}
            shape={dotShape}
            isAnimationActive={false}
          />
          <Scatter
            name="BGS"
            data={bgs}
            fill={COLOR_BGS}
            line={false}
            opacity={0.7}
            shape={dotShape}
            isAnimationActive={false}
          />
          <Line
            data={vwap}
            dataKey="vwap"
            type="monotone"
            stroke={COLOR_VWAP}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="Avg-10"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
