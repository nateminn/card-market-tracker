"use client";

// User-scoped local state — what the user has added to their watchlist or
// portfolio on top of the seeded mock data. localStorage-backed so it
// persists across reloads.
//
// Keys:
//   cardex.user.watchlist  → string[] of card_ids the user has saved
//   cardex.user.portfolio  → string[] of card_ids the user owns
//
// Pattern matches the rest of the app (useColumns, useStoredValue): SSR-safe
// initial render, hydrate from storage in useEffect, broadcast via a custom
// event so all listeners on the page stay in sync.

import { useCallback, useEffect, useState } from "react";

const KEYS = {
  watchlist: "cardex.user.watchlist",
  portfolio: "cardex.user.portfolio",
} as const;

type Bucket = keyof typeof KEYS;

const EVENT_NAME = "cardex:user-state-change";

function readBucket(bucket: Bucket): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEYS[bucket]);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeBucket(bucket: Bucket, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEYS[bucket], JSON.stringify(ids));
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { bucket } })
    );
  } catch {
    // ignore quota / privacy mode
  }
}

function useBucket(bucket: Bucket) {
  // Start empty so SSR matches hydration. Real values arrive in the effect.
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setIds(readBucket(bucket));
    setHydrated(true);

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ bucket: Bucket }>).detail;
      if (!detail || detail.bucket === bucket) {
        setIds(readBucket(bucket));
      }
    };
    // Same-tab updates via custom event; cross-tab via storage event.
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [bucket]);

  const add = useCallback(
    (id: string) => {
      const cur = readBucket(bucket);
      if (cur.includes(id)) return;
      writeBucket(bucket, [...cur, id]);
    },
    [bucket]
  );

  const remove = useCallback(
    (id: string) => {
      const cur = readBucket(bucket);
      writeBucket(
        bucket,
        cur.filter((x) => x !== id)
      );
    },
    [bucket]
  );

  const toggle = useCallback(
    (id: string) => {
      const cur = readBucket(bucket);
      writeBucket(
        bucket,
        cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      );
    },
    [bucket]
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  return { ids, add, remove, toggle, has, hydrated };
}

export function useWatchlist() {
  return useBucket("watchlist");
}

export function usePortfolio() {
  return useBucket("portfolio");
}
