"use client";

// "Compare with…" section on player detail.
// User can pick up to 3 other players to overlay on a normalized chart
// (each line indexed to 100 at the start of the window).

import { useMemo, useState } from "react";
import CompareChart from "@/components/charts/CompareChart";
import ChangeBadge from "@/components/ui/ChangeBadge";
import { clsx } from "@/components/ui/clsx";

type SparkPoint = { ts: number; value: number };
type Candidate = {
  slug: string;
  name: string;
  sport: string;
  spark: SparkPoint[];
};

type Props = {
  primary: Candidate;
  candidates: Candidate[];
};

const MAX_COMPARE = 3;
const PALETTE = [
  "oklch(82% 0.16 80)",   // saffron
  "oklch(78% 0.20 145)",  // green
  "oklch(72% 0.10 240)",  // blue
  "oklch(68% 0.22 25)",   // red
];

export default function CompareSection({ primary, candidates }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const series = useMemo(() => {
    const list = [
      {
        id: primary.slug,
        label: primary.name,
        points: primary.spark,
        color: PALETTE[0],
      },
    ];
    selected.forEach((slug, idx) => {
      const c = candidates.find((x) => x.slug === slug);
      if (c) {
        list.push({
          id: c.slug,
          label: c.name,
          points: c.spark,
          color: PALETTE[idx + 1],
        });
      }
    });
    return list;
  }, [primary, candidates, selected]);

  const toggle = (slug: string) => {
    setSelected((cur) => {
      if (cur.includes(slug)) return cur.filter((s) => s !== slug);
      if (cur.length >= MAX_COMPARE) return cur;
      return [...cur, slug];
    });
  };

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-fg">
          Compare {primary.name}
        </h2>
        <span className="text-xs text-muted-2">
          Indexed to 100 · pick up to {MAX_COMPARE}
        </span>
      </div>

      <div className="border border-border bg-panel p-4">
        <CompareChart series={series} height={200} />

        <div className="mt-4 flex items-center gap-3 flex-wrap text-xs">
          {/* Always-on legend for primary */}
          <div className="inline-flex items-center gap-2">
            <span
              className="block w-3 h-0.5"
              style={{ background: PALETTE[0] }}
              aria-hidden
            />
            <span className="text-fg">{primary.name}</span>
            {(() => {
              const sorted = [...primary.spark].sort((a, b) => a.ts - b.ts);
              if (sorted.length < 2) return null;
              const change =
                (sorted.at(-1)!.value - sorted[0].value) / Math.max(sorted[0].value, 0.0001);
              return <ChangeBadge pct={change} size="sm" />;
            })()}
          </div>

          {selected.map((slug, idx) => {
            const c = candidates.find((x) => x.slug === slug);
            if (!c) return null;
            const sorted = [...c.spark].sort((a, b) => a.ts - b.ts);
            const change =
              sorted.length >= 2
                ? (sorted.at(-1)!.value - sorted[0].value) /
                  Math.max(sorted[0].value, 0.0001)
                : null;
            return (
              <div key={c.slug} className="inline-flex items-center gap-2">
                <span
                  className="block w-3 h-0.5"
                  style={{ background: PALETTE[idx + 1] }}
                  aria-hidden
                />
                <span className="text-fg">{c.name}</span>
                <ChangeBadge pct={change} size="sm" />
                <button
                  type="button"
                  onClick={() => toggle(c.slug)}
                  className="text-muted hover:text-down transition-colors duration-150 ml-1"
                  aria-label={`Remove ${c.name}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Picker */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="eyebrow mb-2">Add to chart</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const on = selected.includes(c.slug);
              const disabled = !on && selected.length >= MAX_COMPARE;
              return (
                <button
                  key={c.slug}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(c.slug)}
                  className={clsx(
                    "h-7 px-2.5 text-[12px] border rounded-[2px]",
                    "transition-colors duration-150",
                    on
                      ? "bg-accent-quiet border-accent/40 text-accent"
                      : "bg-panel-2 border-border text-fg-2 hover:border-border-2 hover:text-fg",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
