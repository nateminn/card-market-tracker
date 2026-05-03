"use client";

// Reusable client wrapper that renders a PortfolioLine with a Line/Bars
// toggle and a persistent "Fill" sub-toggle (line + gradient = the old
// Area variant). Fill preference is saved to localStorage so it sticks.

import { useEffect, useState } from "react";
import PortfolioLine from "./PortfolioLine";
import ChartVariantTabs, { type ChartVariant } from "@/components/ui/ChartVariantTabs";

type Point = { ts: number; value: number };

type Props = {
  points: Point[];
  height?: number;
  initialVariant?: ChartVariant;
};

const FILL_KEY = "cardex.chart.fill";

export default function InteractiveChart({
  points,
  height = 240,
  initialVariant = "line",
}: Props) {
  const [variant, setVariant] = useState<ChartVariant>(initialVariant);
  const [filled, setFilled] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FILL_KEY);
      if (stored != null) setFilled(stored === "1");
    } catch {
      // ignore quota / privacy mode
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

  // PortfolioLine uses "area" to mean line+fill. Translate.
  const effectiveVariant: ChartVariant =
    variant === "line" && filled ? "area" : variant;

  return (
    <div>
      <PortfolioLine points={points} height={height} variant={effectiveVariant} />
      <div className="mt-3 flex items-center gap-3">
        <ChartVariantTabs value={variant} onChange={setVariant} />
        {variant === "line" ? (
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
    </div>
  );
}
