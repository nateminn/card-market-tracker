// FallbackImg - small client component for external images that may
// disappear (eBay listings rotate, expired listings 404 their thumbnails).
//
// On first render or src change, renders the <img>. If it errors, swaps
// to a tinted-dark placeholder of the same dimensions. Server components
// can use this directly - the client boundary is contained inside.

"use client";

import { useEffect, useState } from "react";
import { clsx } from "./clsx";

type Props = {
  src?: string | null;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  /** Visible character or short text shown in the fallback (e.g. initials). */
  fallback?: string;
};

export default function FallbackImg({
  src,
  alt = "",
  width,
  height,
  className,
  fallback = "",
}: Props) {
  const [errored, setErrored] = useState(false);
  // Reset error state if src changes (e.g. for variant switches)
  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        draggable={false}
        onError={() => setErrored(true)}
        className={clsx("object-cover", className)}
        style={{ width, height }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={clsx(
        "shrink-0 inline-flex items-center justify-center select-none",
        "bg-panel-2 border border-border-2 text-[9px] font-mono text-muted",
        className,
      )}
      style={{ width, height }}
    >
      {fallback}
    </div>
  );
}
