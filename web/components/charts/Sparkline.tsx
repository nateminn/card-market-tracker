"use client";

// Sparkline — tiny inline price chart. Hover reveals a date + price tooltip.
// No axes, no labels. Tone derived from first vs last point.

import { useState } from "react";

type Point = { ts: number; value: number };

type Props = {
  points: Point[];
  width?: number;
  height?: number;
  /** Force a tone; defaults to first-vs-last derivation. */
  tone?: "up" | "down" | "muted";
  className?: string;
  /** Show date+price tooltip on hover. Defaults true. */
  interactive?: boolean;
};

const COLOR = {
  up: "var(--color-up)",
  down: "var(--color-down)",
  muted: "var(--color-muted)",
};

export default function Sparkline({
  points,
  width = 80,
  height = 24,
  tone,
  className,
  interactive = true,
}: Props) {
  const [hover, setHover] = useState<{ x: number; y: number; ts: number; value: number } | null>(
    null
  );

  if (points.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-muted-2)"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const ys = sorted.map((p) => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const minX = sorted[0].ts;
  const maxX = sorted[sorted.length - 1].ts;
  const rangeX = maxX - minX || 1;

  const PAD = 2;
  const xy = (p: Point) => {
    const x = PAD + ((p.ts - minX) / rangeX) * (width - PAD * 2);
    const y = height - PAD - ((p.value - minY) / rangeY) * (height - PAD * 2);
    return [x, y] as const;
  };

  const d = sorted
    .map((p, i) => {
      const [x, y] = xy(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const derived = sorted[sorted.length - 1].value > sorted[0].value ? "up" : "down";
  const t = tone ?? derived;

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * width;
    // Find nearest point by x
    let best = sorted[0];
    let bestDist = Infinity;
    for (const p of sorted) {
      const [px] = xy(p);
      const dist = Math.abs(px - localX);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    const [px, py] = xy(best);
    setHover({ x: px, y: py, ts: best.ts, value: best.value });
  };

  const fmtUsd = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(2)}`;
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block" }}
      >
        <path
          d={d}
          fill="none"
          stroke={COLOR[t]}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hover ? (
          <>
            <line
              x1={hover.x}
              y1={0}
              x2={hover.x}
              y2={height}
              stroke="var(--color-border-2)"
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <circle cx={hover.x} cy={hover.y} r={2.5} fill={COLOR[t]} />
          </>
        ) : null}
      </svg>
      {hover && interactive ? (
        <span
          className="absolute z-30 pointer-events-none"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: hover.y < height / 2 ? height + 4 : -28,
            transform: "translateX(-50%)",
          }}
        >
          <span className="inline-block bg-panel-2 border border-border-2 text-fg text-[10px] font-mono px-1.5 py-0.5 whitespace-nowrap">
            {fmtDate(hover.ts)} · {fmtUsd(hover.value)}
          </span>
        </span>
      ) : null}
    </span>
  );
}
