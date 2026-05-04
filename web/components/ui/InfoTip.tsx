"use client";

// InfoTip - a tiny ⓘ icon. Hover (or focus) to see a one-line definition.
// Pure CSS tooltip via :hover/:focus + group-* - no JS state needed.
// Definitions live in DEFINITIONS below; pass a key for the lookup.

import { clsx } from "./clsx";

export const DEFINITIONS = {
  // Pricing
  vwap_30d:
    "Average sale price across the last 30 days, weighted by volume. PSA + BGS.",
  vwap_7d: "Average sale price across the last 7 days. PSA + BGS.",
  vwap_90d: "Average sale price across the last 90 days. PSA + BGS.",
  psa10_30d: "Average price for PSA 10 sales in the last 30 days.",
  raw_30d: "Average price for ungraded sales in the last 30 days.",

  // Momentum / activity
  momentum:
    "Change between the 7-day and 30-day average price. Positive = trending up.",
  velocity: "Sales per day across the last 30 days.",
  sales_30d: "Number of recorded sales in the last 30 days.",
  signal_score: "Composite of momentum, sample density, and confidence (0 to 100).",
  confidence:
    "How trustworthy the price signal is, based on how many recent graded sales we've seen. Insufficient (<3 sales/90d) means a single noisy sale will swing the average; treat the price as a guess, not a quote. High = 30+ sales/90d.",
  psa10_to_psa9:
    "Multiple of PSA 10 vs. PSA 9 average price. e.g. 1.8× means a PSA 10 trades for 1.8× a PSA 9 of the same card. Higher = bigger gem premium.",
  bgs95_to_bgs9:
    "Multiple of BGS 9.5 vs. BGS 9 average price for this card.",
  bgs10_to_bgs95:
    "Multiple of BGS 10 (Pristine) vs. BGS 9.5. Pristine 10s are scarce so the multiple is often 3×+ on top names.",

  // Portfolio
  invested: "Total amount paid (cost basis), excluding fees.",
  current_value: "Estimated current value at the latest tracked price.",
  realized_pl: "Profit or loss on cards already sold (after fees).",
  unrealized_pl:
    "Paper profit or loss on cards still held, vs. their cost basis.",
  total_pl: "Realized plus unrealized profit and loss combined.",
  avg_buy: "Average price paid per copy, including fees.",
  mkt_value: "Quantity held times the latest tracked price.",
  held: "Days since the oldest open buy of this card.",
  win_rate: "Share of closed positions that ended profitable.",
  qty: "Number of copies you hold (or held when closed).",

  // Generic
  thesis: "Plain-English reason this card is on the radar today.",
  variations:
    "A player has many distinct cards across products. This is one of them.",
} as const;

type Key = keyof typeof DEFINITIONS;

type Props = {
  k: Key;
  /** Optional override text instead of pulling from DEFINITIONS. */
  text?: string;
  className?: string;
  /** Position the tooltip on the left or right of the icon. */
  side?: "right" | "left" | "top" | "bottom";
};

const SIDE_CLASSES: Record<NonNullable<Props["side"]>, string> = {
  right: "left-full ml-2 top-1/2 -translate-y-1/2",
  left: "right-full mr-2 top-1/2 -translate-y-1/2",
  top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
  bottom: "top-full mt-1 left-1/2 -translate-x-1/2",
};

export default function InfoTip({ k, text, className, side = "bottom" }: Props) {
  const body = text ?? DEFINITIONS[k];
  return (
    <span
      className={clsx(
        "relative inline-flex items-center justify-center align-middle",
        "size-2.5 rounded-full text-[7px] leading-none font-mono",
        "border border-muted-2/70 text-muted-2",
        "cursor-help select-none",
        "hover:border-fg-2 hover:text-fg-2 transition-colors duration-150",
        "group focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
        className
      )}
      tabIndex={0}
      role="img"
      aria-label={body}
    >
      i
      <span
        role="tooltip"
        className={clsx(
          "absolute z-40 w-56 px-2.5 py-1.5",
          "text-[11px] font-normal leading-snug normal-case tracking-normal",
          "bg-panel-2 text-fg border border-border-2",
          "rounded-sm shadow-lg",
          "opacity-0 invisible pointer-events-none",
          "group-hover:opacity-100 group-hover:visible",
          "group-focus:opacity-100 group-focus:visible",
          "transition-opacity duration-150",
          SIDE_CLASSES[side]
        )}
      >
        {body}
      </span>
    </span>
  );
}
