// CardImage - placeholder used everywhere a trading-card thumbnail belongs.
// Trading cards are 2.5:3.5 aspect ratio (≈ 0.714). When real CardSight image
// URLs land, this component just swaps the placeholder for an <img>.
//
// The placeholder is intentionally subtle: a tiny tilted card silhouette with
// the player's initials. Avoids the "missing image" feeling without faking
// content we don't have.

import { clsx } from "./clsx";

type Props = {
  /** Player name - used for initials in the placeholder. */
  player?: string;
  /** Card subtitle / set - used as tooltip / a11y. */
  alt?: string;
  /** Future: src URL when we have real images. */
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

  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? player}
        width={width}
        height={height}
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
        className
      )}
      style={{ width, height }}
    >
      {ini || "-"}
    </div>
  );
}
