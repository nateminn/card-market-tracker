// FeaturedCards - top N most-valuable variants for a player, shown as image
// cards in a grid. The "famous Mike Trout rookie" view: people don't want to
// scroll a 1000-row table; they want to see the marquee cards immediately.
//
// Selection heuristic for now is "highest PSA 10 30d VWAP". When real pop
// data lands, we can layer in scarcity (low pop) for a more nuanced "iconic"
// score.

import Link from "next/link";
import CardImage from "@/components/ui/CardImage";

type Featured = {
  id: string;
  player_name: string;
  set_name: string;
  release_year: string;
  release_name: string;
  card_number: string;
  is_rookie: boolean;
  image_url?: string;
  price: number | null;
};

function fmtUsd(n: number | null) {
  if (n == null) return "-";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function FeaturedCards({ items }: { items: Featured[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/cards/${c.id}`}
          className="group block border border-border bg-panel hover:border-accent/50 transition-colors duration-150 p-3"
        >
          <div className="aspect-[2.5/3.5] mb-3 bg-panel-2 border border-border-2 overflow-hidden">
            <CardImage
              src={c.image_url}
              player={c.player_name}
              alt={`${c.set_name} #${c.card_number}`}
              width={200}
              className="w-full h-full"
            />
          </div>
          <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-muted-2 mb-0.5">
            {c.release_year}
          </div>
          <div className="text-[13px] text-fg leading-snug truncate">
            {c.release_name}
          </div>
          <div className="text-[12px] text-fg-2 leading-snug truncate">
            {c.set_name}
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-sm text-fg tabular">
              {fmtUsd(c.price)}
            </span>
            {c.is_rookie ? (
              <span className="text-[9px] font-mono uppercase tracking-wider text-up">
                RC
              </span>
            ) : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
