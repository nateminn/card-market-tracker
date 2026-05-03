// ChangeBadge — Robinhood-style ▲ +X.XX% / ▼ −X.XX%
// Triangle marker so the direction is unmistakable, even without color.

import { clsx } from "./clsx";

type Props = {
  /** Decimal percent: 0.054 → "+5.4%". Pass null/undefined to render "—". */
  pct: number | null | undefined;
  /** Optional absolute dollar change to show as well: "+$8.13" */
  abs?: number | null;
  /** Smaller variant for table cells. */
  size?: "sm" | "md";
  /** Override tone; default derives from sign of pct. */
  tone?: "up" | "down" | "muted";
  className?: string;
};

export default function ChangeBadge({
  pct,
  abs,
  size = "md",
  tone,
  className,
}: Props) {
  if (pct == null) {
    return <span className={clsx("text-muted-2 font-mono tabular", className)}>—</span>;
  }
  const t =
    tone ??
    (pct > 0 ? "up" : pct < 0 ? "down" : "muted");
  const symbol = pct > 0 ? "▲" : pct < 0 ? "▼" : "·";
  const color =
    t === "up"
      ? "text-up"
      : t === "down"
        ? "text-down"
        : "text-muted";
  const sizes = size === "sm" ? "text-[12px]" : "text-sm";

  return (
    <span
      className={clsx(
        "inline-flex items-baseline gap-1 font-mono tabular",
        sizes,
        color,
        className
      )}
    >
      <span aria-hidden className="text-[8px] translate-y-[-1px]">
        {symbol}
      </span>
      {abs != null ? (
        <span>
          ${Math.abs(abs).toFixed(2)} ({Math.abs(pct * 100).toFixed(2)}%)
        </span>
      ) : (
        <span>{Math.abs(pct * 100).toFixed(2)}%</span>
      )}
    </span>
  );
}
