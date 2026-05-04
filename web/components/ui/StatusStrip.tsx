// Inline status strip - REPLACES the hero-metric tile template (banned).
// A row of "label value · label value" pairs, sized like body text. Numbers
// in mono, labels in muted text.

import { clsx } from "./clsx";

type Item = {
  label: string;
  value: React.ReactNode;
  /** Optional second-line context (e.g. "+8.7%" under a value). */
  hint?: React.ReactNode;
  tone?: "default" | "up" | "down" | "muted";
};

const TONES = {
  default: "text-fg",
  up: "text-up",
  down: "text-down",
  muted: "text-muted",
};

type Props = {
  items: Item[];
  className?: string;
};

export default function StatusStrip({ items, className }: Props) {
  return (
    <dl
      className={clsx(
        "flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm",
        className
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="inline-flex items-baseline gap-1.5">
          <dt className="text-muted">{it.label}</dt>
          <dd
            className={clsx(
              "font-mono tabular",
              TONES[it.tone ?? "default"]
            )}
          >
            {it.value}
          </dd>
          {it.hint ? (
            <span className={clsx("text-xs font-mono tabular", TONES[it.tone ?? "muted"])}>
              {it.hint}
            </span>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
