"use client";

// CardHero — large card thumbnail with click-to-enlarge lightbox.
// Used on card detail as the primary visual anchor.

import { useEffect, useState } from "react";
import { clsx } from "./clsx";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

type Props = {
  src?: string | null;
  player: string;
  alt: string;
  /** Standard width — height auto-derived for 2.5:3.5 ratio. */
  width?: number;
  className?: string;
};

export default function CardHero({
  src,
  player,
  alt,
  width = 220,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const height = Math.round(width * 1.4);
  const ini = initials(player);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // For the lightbox, swap eBay's 225px thumbnail for 1600px when possible.
  // (eBay serves multiple sizes from the same path; s-l1600 is full-res.)
  const enlarged = src?.replace("/s-l225.jpg", "/s-l1600.jpg") ?? src;

  return (
    <>
      <button
        type="button"
        onClick={() => src && setOpen(true)}
        aria-label={src ? `Enlarge ${alt}` : alt}
        className={clsx(
          "shrink-0 group relative",
          src ? "cursor-zoom-in" : "cursor-default",
          className
        )}
        style={{ width, height }}
      >
        {src ? (
          <>
            <img
              src={src}
              alt={alt}
              width={width}
              height={height}
              className="object-cover w-full h-full border border-border-2 transition-shadow duration-150 group-hover:shadow-[0_0_0_1px_var(--color-accent)]"
              draggable={false}
            />
            <span
              aria-hidden
              className="absolute bottom-1.5 right-1.5 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-bg/80 border border-border text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            >
              Click to enlarge
            </span>
          </>
        ) : (
          <div
            role="img"
            aria-label={alt}
            className="w-full h-full inline-flex items-center justify-center select-none bg-panel-2 border border-border-2 text-sm font-mono text-muted"
          >
            {ini || "—"}
          </div>
        )}
      </button>

      {open && src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out animate-fade-in"
        >
          <img
            src={enlarged ?? undefined}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] object-contain border border-border-2 shadow-2xl cursor-zoom-out"
            draggable={false}
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close preview"
            className="fixed top-4 right-4 size-9 rounded-md bg-panel-2 border border-border-2 text-fg-2 hover:text-fg hover:border-accent transition-colors duration-150 inline-flex items-center justify-center text-lg leading-none"
          >
            ×
          </button>
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-mono uppercase tracking-[0.08em] text-muted-2">
            Press Esc or click anywhere to close
          </div>
        </div>
      ) : null}
    </>
  );
}
