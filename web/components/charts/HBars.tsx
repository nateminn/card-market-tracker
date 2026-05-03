// Generic horizontal bar list — used for grade distribution / source mix.
// Each bar shows label, bar fill proportional to value, and a value readout.

import { clsx } from "@/components/ui/clsx";

type Item = { label: string; value: number; tone?: "up" | "down" | "muted" | "accent" };

const BAR_COLOR: Record<NonNullable<Item["tone"]>, string> = {
  up: "bg-up",
  down: "bg-down",
  muted: "bg-muted-2",
  accent: "bg-accent",
};

type Props = {
  items: Item[];
  /** Format the value as displayed (default: integer). */
  format?: (n: number) => string;
  className?: string;
};

export default function HBars({ items, format, className }: Props) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = format ?? ((n: number) => String(n));
  return (
    <div className={clsx("space-y-1.5", className)}>
      {items.map((it) => {
        const pct = (it.value / max) * 100;
        return (
          <div key={it.label} className="flex items-center gap-2">
            <div className="w-20 text-[11px] text-muted truncate font-mono">
              {it.label}
            </div>
            <div className="flex-1 h-3 bg-panel-2 relative overflow-hidden">
              <div
                className={clsx(
                  "absolute left-0 top-0 bottom-0",
                  BAR_COLOR[it.tone ?? "muted"]
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-14 text-right text-[11px] font-mono tabular text-fg-2">
              {fmt(it.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
