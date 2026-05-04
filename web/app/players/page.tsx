// /players - searchable directory of every player in the catalog.
// Server-renders the data; PlayersTable is a client component for filtering /
// sorting in-browser.
//
// Sparkline windows (7d/30d/90d) used to be pre-resolved server-side, but that
// was N×3 sequential DB queries - fine on a fast local connection, fatal in
// Netlify's edge-function timeout. Now we render the table immediately with
// empty sparklines; on-demand client-side fetching can come later if useful.

import Link from "next/link";
import { getPlayers } from "@/lib/data";
import PlayersTable from "./PlayersTable";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayers();
  const data = players.map((p) => ({
    ...p,
    spark_7d: [] as { ts: number; value: number }[],
    spark_30d: [] as { ts: number; value: number }[],
    spark_90d: [] as { ts: number; value: number }[],
  }));

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Players</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl text-fg leading-none mb-2">Players</h1>
        <p className="text-sm text-muted max-w-2xl">
          Every player in the catalog. Search by name, sort by any column, click
          into a player to see their cards, charts, and news.
        </p>
      </div>

      <PlayersTable data={data} />
    </div>
  );
}
