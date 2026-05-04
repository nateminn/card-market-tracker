"use client";

// Robinhood-style chart with three render modes: line / area / bars.
// Always renders X (date) and Y ($value) axis labels - without them users
// can't tell what they're looking at. Axes are subtle (muted-2 + 10px) so
// the chart still feels minimal.
//
// Stretching: SVG uses preserveAspectRatio="none" so the chart fills its
// container, but axis labels are rendered as HTML divs in the parent
// wrapper so text stays crisp at any width.
//
// On mount the line traces left-to-right (stroke-dashoffset trick) so the
// chart "draws itself" once. Respects prefers-reduced-motion.

import { useEffect, useRef } from "react";

type Point = { ts: number; value: number };

type Props = {
  points: Point[];
  height?: number;
  className?: string;
  variant?: "line" | "area" | "bars";
};

const Y_AXIS_W = 48; // px reserved for $ labels
const X_AXIS_H = 18; // px reserved for date labels

function fmtUsd(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function fmtDate(ts: number) {
  // Pin to en-US so server and client render identical strings (avoids the
  // hydration mismatch between OS locale "27 Mar" vs "Mar 27").
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Five evenly-spaced tick values across [min, max] (inclusive endpoints). */
function fiveTicks(min: number, max: number): number[] {
  if (min === max) return [min];
  return Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
}

export default function PortfolioLine({
  points,
  height = 220,
  className,
  variant = "line",
}: Props) {
  const linePathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const el = linePathRef.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const len = el.getTotalLength?.() ?? 0;
    if (!len) return;
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.getBoundingClientRect();
    el.style.transition =
      "stroke-dashoffset 900ms cubic-bezier(0.25, 1, 0.5, 1)";
    requestAnimationFrame(() => {
      el.style.strokeDashoffset = "0";
    });
  }, [points, variant]);

  if (points.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted ${className ?? ""}`}
        style={{ height }}
      >
        Not enough sales to chart.
      </div>
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

  // SVG inner viewBox dimensions (chart area only - no axis space here).
  const width = 1000;
  const innerH = height - X_AXIS_H;
  const padY = 8;
  const xy = (p: Point) => {
    const x = ((p.ts - minX) / rangeX) * width;
    const y = padY + ((maxY - p.value) / rangeY) * (innerH - padY * 2);
    return [x, y] as const;
  };
  const baselineY =
    padY + ((maxY - sorted[0].value) / rangeY) * (innerH - padY * 2);

  const tone = sorted[sorted.length - 1].value >= sorted[0].value ? "up" : "down";
  const stroke = tone === "up" ? "var(--color-up)" : "var(--color-down)";

  const lineD = sorted
    .map((p, i) => {
      const [x, y] = xy(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = sorted[sorted.length - 1];
  const areaD =
    lineD +
    ` L${xy(last)[0].toFixed(1)},${(innerH - padY).toFixed(1)}` +
    ` L${xy(sorted[0])[0].toFixed(1)},${(innerH - padY).toFixed(1)} Z`;

  const yTicks = fiveTicks(minY, maxY);
  const xTicks = fiveTicks(minX, maxX);

  return (
    <div
      className={`relative ${className ?? ""}`}
      style={{ height, paddingLeft: Y_AXIS_W }}
    >
      {/* Y-axis labels - absolutely positioned HTML so text stays crisp */}
      <div
        className="absolute left-0 top-0 font-mono text-[10px] tabular text-muted-2"
        style={{ width: Y_AXIS_W - 6, height: innerH }}
      >
        {yTicks.map((v, i) => {
          const topPct =
            (((maxY - v) / rangeY) * (innerH - padY * 2) + padY) / innerH;
          return (
            <span
              key={i}
              className="absolute right-0 -translate-y-1/2 pr-1.5"
              style={{ top: `${topPct * 100}%` }}
            >
              {fmtUsd(v)}
            </span>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div
        className="absolute left-0 right-0 bottom-0 font-mono text-[10px] tabular text-muted-2"
        style={{ height: X_AXIS_H, paddingLeft: Y_AXIS_W }}
      >
        {xTicks.map((ts, i) => {
          const leftPct = ((ts - minX) / rangeX) * 100;
          return (
            <span
              key={i}
              className="absolute -translate-x-1/2 pt-0.5"
              style={{ left: `${leftPct}%` }}
            >
              {fmtDate(ts)}
            </span>
          );
        })}
      </div>

      <svg
        viewBox={`0 0 ${width} ${innerH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: innerH, display: "block" }}
      >
        {/* Y gridlines at each tick */}
        {yTicks.map((v, i) => {
          const y = padY + ((maxY - v) / rangeY) * (innerH - padY * 2);
          return (
            <line
              key={`g-${i}`}
              x1={0}
              y1={y}
              x2={width}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth="1"
              opacity={i === 0 || i === yTicks.length - 1 ? 0 : 0.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {/* Baseline (first-value reference) */}
        <line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="var(--color-muted-2)"
          strokeDasharray="2 4"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {variant === "bars"
          ? sorted.map((p, i) => {
              const [x, y] = xy(p);
              const barW = (width / sorted.length) * 0.8;
              const h = innerH - padY - y;
              return (
                <rect
                  key={i}
                  x={x - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  fill={stroke}
                  opacity={0.85}
                />
              );
            })
          : null}

        {variant === "area" ? (
          <>
            <defs>
              <linearGradient id="cdx-area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaD} fill="url(#cdx-area-gradient)" stroke="none" />
            <path
              d={lineD}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}

        {variant === "line" ? (
          <path
            ref={linePathRef}
            d={lineD}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}
