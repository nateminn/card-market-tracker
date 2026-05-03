// /players — searchable directory of every player in the catalog.
// Server-renders the data; PlayersTable is a client component for filtering /
// sorting in-browser.

import Link from "next/link";
import { getPlayers, getPlayerSparkline } from "@/lib/data";
import PlayersTable from "./PlayersTable";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const players = await getPlayers();
  // Pre-resolve sparklines for every supported window so the client column
  // switcher can swap the spark series without going back to the server.
  const sparkResults = await Promise.all(
    players.map(async (p) => ({
      slug: p.slug,
      spark_7d: await getPlayerSparkline(p.slug, 7),
      spark_30d: await getPlayerSparkline(p.slug, 30),
      spark_90d: await getPlayerSparkline(p.slug, 90),
    })),
  );
  const sparkBySlug = new Map(sparkResults.map((s) => [s.slug, s]));
  const data = players.map((p) => {
    const sparks = sparkBySlug.get(p.slug);
    return {
      ...p,
      spark_7d: sparks?.spark_7d ?? [],
      spark_30d: sparks?.spark_30d ?? [],
      spark_90d: sparks?.spark_90d ?? [],
    };
  });

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
