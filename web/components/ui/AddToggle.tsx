"use client";

// Toggle button for "Add to watchlist" / "Add to portfolio". When the card is
// already in the relevant bucket, the button flips to a confirmed state with
// an X to remove. Avoids two separate buttons by being in-place.

import { useWatchlist, usePortfolio } from "@/lib/userState";
import { Plus, Check, X, Receipt, Eye } from "lucide-react";
import { clsx } from "./clsx";

type Bucket = "watchlist" | "portfolio";

const COPY: Record<Bucket, { add: string; added: string; icon: React.ReactNode }> = {
  watchlist: {
    add: "Add to watchlist",
    added: "On watchlist",
    icon: <Eye size={14} />,
  },
  portfolio: {
    add: "Add to portfolio",
    added: "In portfolio",
    icon: <Receipt size={14} />,
  },
};

type Props = {
  cardId: string;
  bucket: Bucket;
  variant?: "primary" | "secondary";
  /** Compact mode renders just the icon - for table rows. */
  compact?: boolean;
  className?: string;
};

export default function AddToggle({
  cardId,
  bucket,
  variant = "secondary",
  compact = false,
  className,
}: Props) {
  const watchlist = useWatchlist();
  const portfolio = usePortfolio();
  const state = bucket === "watchlist" ? watchlist : portfolio;
  const inSet = state.has(cardId);
  const copy = COPY[bucket];

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    state.toggle(cardId);
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={inSet}
        title={inSet ? `Remove from ${bucket}` : copy.add}
        className={clsx(
          "size-7 inline-flex items-center justify-center rounded-md border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
          inSet
            ? "border-up/50 bg-up/10 text-up hover:border-up hover:bg-up/20"
            : "border-border text-muted hover:border-border-2 hover:text-fg",
          className
        )}
      >
        {inSet ? <Check size={13} /> : <Plus size={13} />}
      </button>
    );
  }

  // Full button
  const baseClass =
    variant === "primary"
      ? "bg-accent text-bg hover:bg-accent/90"
      : "bg-panel-2 border border-border text-fg hover:border-border-2";
  const addedClass =
    "bg-up/10 border border-up/40 text-up hover:bg-up/20 hover:border-up";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={inSet}
      className={clsx(
        "h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        inSet ? addedClass : baseClass,
        className
      )}
    >
      {inSet ? (
        <>
          <Check size={14} />
          {copy.added}
          <span aria-hidden className="ml-1 text-muted-2">
            <X size={12} />
          </span>
        </>
      ) : (
        <>
          {copy.icon}
          {copy.add}
        </>
      )}
    </button>
  );
}
