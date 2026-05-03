"use client";

// VolumeBar — sales count per day bar chart. Sits below the price line on
// player / index detail. Tone derived from the most recent week's slope.

type Props = {
  points: { ts: number; count: number }[];
  height?: number;
  className?: string;
};

export default function VolumeBar({ points, height = 60, className }: Props) {
  if (points.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted ${className ?? ""}`}
        style={{ height }}
      >
        No volume data.
      </div>
    );
  }
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  const max = Math.max(...sorted.map((p) => p.count), 1);
  const width = 1000;
  const barW = (width / sorted.length) * 0.75;
  const gap = (width / sorted.length) * 0.25;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      {sorted.map((p, i) => {
        const h = Math.max(1, (p.count / max) * (height - 6));
        const x = i * (barW + gap);
        const y = height - h - 2;
        return (
          <rect
            key={p.ts}
            x={x}
            y={y}
            width={barW}
            height={h}
            fill="oklch(60% 0.006 250)"
          />
        );
      })}
    </svg>
  );
}
