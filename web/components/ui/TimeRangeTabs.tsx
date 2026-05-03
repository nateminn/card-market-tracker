"use client";

// Robinhood-style time range tabs. 1D / 1W / 1M / 3M / YTD / 1Y / ALL
// Active tab gets the up-color underline.
//
// Stateful by default but can be controlled via the `value` prop.

import { useState } from "react";

const RANGES = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"] as const;
export type TimeRange = (typeof RANGES)[number];

type Props = {
  /** Initial range when uncontrolled. */
  defaultValue?: TimeRange;
  /** Controlled value. */
  value?: TimeRange;
  onChange?: (r: TimeRange) => void;
  className?: string;
};

export default function TimeRangeTabs({
  defaultValue = "1D",
  value,
  onChange,
  className,
}: Props) {
  const [internal, setInternal] = useState<TimeRange>(defaultValue);
  const current = value ?? internal;

  const set = (r: TimeRange) => {
    if (value === undefined) setInternal(r);
    onChange?.(r);
  };

  return (
    <div
      role="tablist"
      aria-label="Time range"
      className={`inline-flex items-center border-b border-border ${className ?? ""}`}
    >
      {RANGES.map((r) => (
        <button
          key={r}
          role="tab"
          aria-pressed={current === r}
          onClick={() => set(r)}
          className="timetab focus-visible:outline-none focus-visible:text-up"
        >
          {r}
        </button>
      ))}
    </div>
  );
}
