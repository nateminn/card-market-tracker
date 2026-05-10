// CardImage - trading-card thumbnail used across the site.
// Trading cards are 2.5:3.5 aspect ratio (≈ 0.714).
//
// When `src` is provided we render the real image with two safety nets:
//   - `loading="lazy"` so off-screen thumbnails don't block first paint
//   - onError fallback to the initials placeholder, since eBay/CardSight
//     image URLs rot when listings expire (broken-image icons looked
//     worse than no image)
//
// When `src` is null/undefined we render a tiny tilted-card silhouette
// with the player's initials. Avoids the "missing image" feeling without
// faking content we don't have.

"use client";

import { useState } from "react";
import { clsx } from "./clsx";

type Props = {
  /** Player name - used for initials in the placeholder. */
  player?: string;
  /** Card subtitle / set - used as tooltip / a11y. */
  alt?: string;
  /** Image URL (CardSight or eBay). Null/undefined renders the placeholder. */
  src?: string | null;
  /** Sizing - width in px; height auto-derived for 2.5:3.5 ratio. */
  width?: number;
  className?: string;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

export default function CardImage({
  player = "",
  alt,
  src,
  width = 36,
  className,
}: Props) {
  const height = Math.round(width * 1.4); // 2.5:3.5 → 1.4 ratio
  const ini = initials(player);
  const [errored, setErrored] = useState(false);

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt ?? player}
        width={width}
        height={height}
        loading="lazy"
        onError={() => setErrored(true)}
        className={clsx("object-cover", className)}
        style={{ width, height }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt ?? player}
      className={clsx(
        "shrink-0 inline-flex items-center justify-center select-none",
        "bg-panel-2 border border-border-2",
        "text-[9px] font-mono text-muted",
        className,
      )}
      style={{ width, height }}
    >
      {ini || "-"}
    </div>
  );
}
