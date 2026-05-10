"use client";

// Header search - fuzzy match over players and cards. Substring-first
// scoring so "trout" surfaces "Mike Trout" before any random card whose
// title happens to contain "trout". Top 8 results in a dropdown; arrow
// keys navigate; Enter submits to the highlighted result.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardImage from "./CardImage";
import PlayerAvatar from "./PlayerAvatar";

type SearchPlayer = {
  slug: string;
  name: string;
  sport: string;
  cardCount: number;
};

type SearchCard = {
  id: string;
  player_name: string;
  release_year: string;
  release_name: string;
  set_name: string;
  card_number: string;
  is_rookie: boolean;
  image_url?: string;
};

type Hit =
  | { kind: "player"; score: number; data: SearchPlayer }
  | { kind: "card"; score: number; data: SearchCard };

type Props = {
  players: SearchPlayer[];
  cards: SearchCard[];
};

const MAX_RESULTS = 8;

function scorePlayer(p: SearchPlayer, q: string): number {
  const name = p.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  // Match against any word boundary (handles "trout" matching "Mike Trout")
  if (name.split(" ").some((w) => w.startsWith(q))) return 80;
  if (name.includes(q)) return 60;
  return 0;
}

function scoreCard(c: SearchCard, q: string): number {
  const blob = `${c.player_name} ${c.release_year} ${c.release_name} ${c.set_name} #${c.card_number}`.toLowerCase();
  // Cards score lower than players - players are the primary entity.
  if (blob.startsWith(q)) return 70;
  // Match all space-separated tokens of the query individually
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => blob.includes(t))) return 50;
  if (blob.includes(q)) return 40;
  return 0;
}

function search(players: SearchPlayer[], cards: SearchCard[], q: string): Hit[] {
  if (!q) return [];
  const lower = q.toLowerCase().trim();
  const hits: Hit[] = [];
  for (const p of players) {
    const score = scorePlayer(p, lower);
    if (score > 0) hits.push({ kind: "player", score, data: p });
  }
  for (const c of cards) {
    const score = scoreCard(c, lower);
    if (score > 0) hits.push({ kind: "card", score, data: c });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, MAX_RESULTS);
}

export default function SearchBox({ players, cards }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  const results = useMemo(() => search(players, cards, query), [players, cards, query]);

  // Close on outside click + reset highlight when results change.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => setHighlight(0), [query]);

  // Keyboard shortcut: ⌘K / Ctrl+K to focus search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[highlight];
      if (hit) {
        const href =
          hit.kind === "player"
            ? `/players/${hit.data.slug}`
            : `/cards/${hit.data.id}`;
        router.push(href);
        setOpen(false);
        setQuery("");
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <label className="cdx-search flex items-center gap-2 h-9 px-3 bg-panel-2 border border-border rounded-md focus-within:border-border-2 transition-colors">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder="Search players, sets, parallels"
          className="flex-1 bg-transparent text-sm placeholder:text-muted focus:outline-none"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="cardex-search-results"
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-muted-2 shrink-0 hidden sm:inline">
          ⌘K
        </span>
      </label>

      {open && query ? (
        <div
          id="cardex-search-results"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 z-40 bg-panel-2 border border-border-2 rounded-sm shadow-xl max-h-[60vh] overflow-y-auto"
        >
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-muted">
              No matches for &quot;{query}&quot;.
            </div>
          ) : (
            results.map((hit, i) => {
              const isActive = i === highlight;
              if (hit.kind === "player") {
                const p = hit.data;
                return (
                  <Link
                    key={`p-${p.slug}`}
                    href={`/players/${p.slug}`}
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    role="option"
                    aria-selected={isActive}
                    className={`flex items-center gap-3 px-3 py-2 transition-colors duration-150 ${
                      isActive ? "bg-panel" : "hover:bg-panel"
                    }`}
                  >
                    <PlayerAvatar player={p.name} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-fg truncate">{p.name}</div>
                      <div className="text-[11px] text-muted">
                        {p.sport} · {p.cardCount} {p.cardCount === 1 ? "card" : "cards"}
                      </div>
                    </div>
                    <span className="text-[9px] font-mono uppercase tracking-[0.08em] text-muted-2">
                      Player
                    </span>
                  </Link>
                );
              }
              const c = hit.data;
              return (
                <Link
                  key={`c-${c.id}`}
                  href={`/cards/${c.id}`}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  role="option"
                  aria-selected={isActive}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors duration-150 ${
                    isActive ? "bg-panel" : "hover:bg-panel"
                  }`}
                >
                  <CardImage
                    src={c.image_url}
                    player={c.player_name}
                    alt={`${c.set_name} #${c.card_number}`}
                    width={22}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-fg truncate">
                      {c.player_name}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {c.release_year} {c.release_name} · {c.set_name} · #{c.card_number}
                      {c.is_rookie ? (
                        <span className="ml-1.5 text-up font-mono">RC</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-[0.08em] text-muted-2">
                    Card
                  </span>
                </Link>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
