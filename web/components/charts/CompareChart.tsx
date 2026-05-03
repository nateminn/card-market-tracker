"use client";

// Multi-line comparison chart. Renders up to N normalized series so user
// can overlay players or indices regardless of price scale. Each line is
// indexed to 100 at the first observation in the window.

type Series = {
  id: string;
  label: string;
  points: { ts: number; value: number }[];
  color: string;
};

type Props = {
  series: Series[];
  height?: number;
  className?: string;
};

const PALETTE = [
  "oklch(82% 0.16 80)",   // accent saffron
  "oklch(78% 0.20 145)",  // up green
  "oklch(72% 0.10 240)",  // info blue
  "oklch(75% 0.14 80)",   // warn
  "oklch(68% 0.22 25)",   // down red
];

export default function CompareChart({
  series,
  height = 200,
  className,
}: Props) {
  if (series.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted ${className ?? ""}`}
        style={{ height }}
      >
        Pick something to compare.
      </div>
    );
  }

  // Normalize: each series indexed to 100 at first point
  const normalized = series.map((s) => {
    const sorted = [...s.points].sort((a, b) => a.ts - b.ts);
    if (sorted.length === 0) return { ...s, normPoints: [] };
    const base = sorted[0].value;
    return {
      ...s,
      normPoints: sorted.map((p) => ({
        ts: p.ts,
        value: base > 0 ? (p.value / base) * 100 : 100,
      })),
    };
  });

  const allTs = normalized.flatMap((s) => s.normPoints.map((p) => p.ts));
  const allVal = normalized.flatMap((s) => s.normPoints.map((p) => p.value));

  if (allTs.length === 0 || allVal.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted ${className ?? ""}`}
        style={{ height }}
      >
        Not enough data.
      </div>
    );
  }

  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const minVal = Math.min(...allVal);
  const maxVal = Math.max(...allVal);
  const padY = 14;
  const width = 1000;
  const xy = (ts: number, value: number) => {
    const x =
      ((ts - minTs) / Math.max(maxTs - minTs, 1)) * width;
    const y =
      padY +
      ((maxVal - value) / Math.max(maxVal - minVal, 1)) * (height - padY * 2);
    return [x, y] as const;
  };

  // Baseline at 100 (the indexed start)
  const baselineY = padY + ((maxVal - 100) / Math.max(maxVal - minVal, 1)) * (height - padY * 2);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <line
        x1={0}
        y1={baselineY}
        x2={width}
        y2={baselineY}
        stroke="oklch(28% 0.010 250)"
        strokeDasharray="2 4"
        strokeWidth="1"
      />
      {normalized.map((s, idx) => {
        const stroke = s.color || PALETTE[idx % PALETTE.length];
        const d = s.normPoints
          .map((p, i) => {
            const [x, y] = xy(p.ts, p.value);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <path
            key={s.id}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

CompareChart.PALETTE = PALETTE;
