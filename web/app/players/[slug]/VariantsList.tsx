"use client";

// VariantsList — grouped, collapsible card-variant browser scoped to one
// player. Tree shape: Year → Release (brand) → Set, with a row per card at
// the leaf. Designed for the "LeBron has 1000 cards" case: the user can
// drill into the year/brand they care about instead of scrolling a flat
// table.
//
// Default behaviour:
//  - Year groups are open if there are ≤4 of them, collapsed otherwise.
//  - Within a year, releases auto-open if the year is open.
// Counts are shown next to each group label.

import { useMemo, useState } from "react";
import Link from "next/link";
import CardImage from "@/components/ui/CardImage";
import ChangeBadge from "@/components/ui/ChangeBadge";
import { ChevronRight } from "lucide-react";
import { clsx } from "@/components/ui/clsx";

type CardLite = {
  id: string;
  player_name: string;
  card_number: string;
  is_rookie: boolean;
  release_year: string;
  release_name: string;
  set_name: string;
  image_url?: string;
};

type CardWithAnalytics = CardLite & {
  psa10_30d: number | null;
  sales_30d: number | null;
  momentum: number | null;
};

type Props = {
  cards: CardWithAnalytics[];
};

function fmtUsd(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}

export default function VariantsList({ cards }: Props) {
  // Build the tree once.
  const tree = useMemo(() => {
    const byYear = new Map<string, Map<string, CardWithAnalytics[]>>();
    for (const c of cards) {
      const yearMap = byYear.get(c.release_year) ?? new Map();
      const list = yearMap.get(c.release_name) ?? [];
      list.push(c);
      yearMap.set(c.release_name, list);
      byYear.set(c.release_year, yearMap);
    }
    const years = Array.from(byYear.entries())
      .map(([year, releases]) => ({
        year,
        releases: Array.from(releases.entries())
          .map(([name, items]) => ({
            name,
            cards: items.sort(
              (a, b) =>
                (b.psa10_30d ?? 0) - (a.psa10_30d ?? 0)
            ),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.year.localeCompare(a.year));
    return years;
  }, [cards]);

  // Default open state: open all years if ≤4; otherwise only the most-recent.
  const [openYears, setOpenYears] = useState<Set<string>>(() => {
    if (tree.length <= 4) return new Set(tree.map((y) => y.year));
    return new Set(tree.slice(0, 1).map((y) => y.year));
  });

  const toggleYear = (year: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  if (cards.length === 0) {
    return (
      <div className="border border-border bg-panel/40 px-6 py-10 text-center text-sm text-muted">
        No cards in catalog yet.
      </div>
    );
  }

  return (
    <div className="border border-border bg-panel divide-y divide-border">
      {tree.map((yearGroup) => {
        const isOpen = openYears.has(yearGroup.year);
        const yearTotal = yearGroup.releases.reduce(
          (s, r) => s + r.cards.length,
          0
        );
        return (
          <div key={yearGroup.year}>
            <button
              type="button"
              onClick={() => toggleYear(yearGroup.year)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2 transition-colors duration-150 text-left"
            >
              <ChevronRight
                size={14}
                className={clsx(
                  "text-muted-2 transition-transform duration-150 shrink-0",
                  isOpen && "rotate-90"
                )}
              />
              <span className="font-mono text-[12px] tabular text-fg">
                {yearGroup.year}
              </span>
              <span className="text-[11px] text-muted">
                {yearGroup.releases.length}{" "}
                {yearGroup.releases.length === 1 ? "release" : "releases"}
              </span>
              <span className="ml-auto text-[11px] font-mono text-muted-2 tabular">
                {yearTotal} {yearTotal === 1 ? "card" : "cards"}
              </span>
            </button>

            {isOpen ? (
              <div className="bg-bg/40">
                {yearGroup.releases.map((release) => (
                  <ReleaseGroup
                    key={`${yearGroup.year}-${release.name}`}
                    yearKey={yearGroup.year}
                    name={release.name}
                    cards={release.cards}
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ReleaseGroup({
  yearKey,
  name,
  cards,
}: {
  yearKey: string;
  name: string;
  cards: CardWithAnalytics[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 pl-9 pr-4 py-2 hover:bg-panel-2 transition-colors duration-150 text-left"
      >
        <ChevronRight
          size={12}
          className={clsx(
            "text-muted-2 transition-transform duration-150 shrink-0",
            open && "rotate-90"
          )}
        />
        <span className="text-[12px] text-fg-2">{name}</span>
        <span className="ml-auto text-[11px] font-mono text-muted-2 tabular">
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </span>
      </button>

      {open ? (
        <div>
          <div className="hidden sm:flex items-center gap-3 pl-14 pr-4 py-1.5 bg-panel-2/40 eyebrow">
            <div className="flex-1 min-w-0">Set · #</div>
            <div className="w-24 text-right">PSA 10 30d</div>
            <div className="hidden md:block w-16 text-right">Sales</div>
            <div className="hidden md:block w-20 text-right">Momentum</div>
            <div className="w-4" />
          </div>
          {cards.map((c) => (
            <Link
              key={c.id}
              href={`/cards/${c.id}`}
              className="flex items-center gap-3 pl-4 sm:pl-14 pr-4 py-2.5 border-t border-border first:border-t-0 hover:bg-panel-2 transition-colors duration-150"
            >
              <CardImage
                src={c.image_url}
                player={c.player_name}
                alt={`${c.set_name} #${c.card_number}`}
                width={24}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-fg truncate">
                  {c.set_name}{" "}
                  <span className="text-muted-2 font-mono">·</span>{" "}
                  <span className="font-mono text-muted">#{c.card_number}</span>
                  {c.is_rookie ? (
                    <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-up">
                      RC
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="w-20 sm:w-24 text-right font-mono text-sm tabular text-fg shrink-0">
                {fmtUsd(c.psa10_30d)}
              </div>
              <div className="hidden md:block w-16 text-right font-mono text-sm tabular text-fg-2 shrink-0">
                {c.sales_30d ?? 0}
              </div>
              <div className="hidden md:block w-20 text-right shrink-0">
                <ChangeBadge pct={c.momentum} size="sm" />
              </div>
              <div className="hidden sm:block w-4 text-right text-muted text-xs shrink-0">→</div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
