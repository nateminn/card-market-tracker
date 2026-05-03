"use client";

// Shared chart-type toggle: Line / Bars. "Area" was previously a chart type
// but it's the same data as Line with a gradient — better as a separate
// persistent "Fill" preference (see ChartFillToggle).

const VARIANTS = [
  { id: "line", label: "Line" },
  { id: "bars", label: "Bars" },
] as const;

export type ChartVariant = (typeof VARIANTS)[number]["id"] | "area";

type Props = {
  value: ChartVariant;
  onChange: (v: ChartVariant) => void;
  className?: string;
};

export default function ChartVariantTabs({
  value,
  onChange,
  className,
}: Props) {
  // "area" still passes through for back-compat but isn't a tab now.
  const active = value === "area" ? "line" : value;
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="eyebrow">Chart</span>
      {VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={active === v.id}
          onClick={() => onChange(v.id)}
          className="pill"
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
