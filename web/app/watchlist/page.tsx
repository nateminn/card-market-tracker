// Watchlist — server-renders rows from Supabase. Batched queries for speed
// (one Supabase round-trip for cards, one for analytics, one for sales →
// then sparklines computed in-process).

import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getCardsByIds, type Sale } from "@/lib/data";
import WatchlistTable, { type Row } from "./WatchlistTable";

export const dynamic = "force-dynamic";

const ALLOWED_GRADERS = new Set(["PSA", "BGS"]);

export default async function WatchlistPage() {
  const sb = supabase();

  // 1) Pull all watchlist entries.
  const { data: wlData } = await sb
    .from("watchlist")
    .select("card_id, added_at, target_buy_usd, target_sell_usd, notes");
  const watchlist = wlData || [];
  const ids = watchlist.map((w) => w.card_id);

  if (ids.length === 0) {
    return (
      <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
        <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
          <Link href="/" className="hover:text-fg transition-colors duration-150">
            Market
          </Link>
          <span className="mx-2 text-muted-2">/</span>
          <span className="text-fg-2">Watchlist</span>
        </nav>
        <WatchlistTable seededRows={[]} otherRows={[]} />
      </div>
    );
  }

  // 2) Batch-fetch cards, analytics, and sales for ALL watchlist cards.
  const [cardsMap, analyticsRows, salesRows] = await Promise.all([
    getCardsByIds(ids),
    sb.from("analytics_daily").select("*").in("card_id", ids),
    sb
      .from("sales")
      .select("card_id, sold_at, price_usd, is_graded, grader, grade_value")
      .in("card_id", ids),
  ]);
  const analyticsByCard = new Map<string, any>();
  for (const a of analyticsRows.data || []) {
    analyticsByCard.set(a.card_id, a);
  }

  // 3) Compute per-card sparklines from the batched sales.
  const sparkByCard = new Map<string, { ts: number; value: number }[]>();
  const cutoff30 = Date.now() - 30 * 86400 * 1000;
  const dailyByCard = new Map<string, Map<number, number[]>>();
  for (const s of (salesRows.data as Sale[]) || []) {
    if (!s.is_graded || !s.grader || !ALLOWED_GRADERS.has(s.grader)) continue;
    const t = new Date(s.sold_at).getTime();
    if (t < cutoff30) continue;
    const day = Math.floor(t / 86400000) * 86400000;
    let m = dailyByCard.get(s.card_id);
    if (!m) {
      m = new Map<number, number[]>();
      dailyByCard.set(s.card_id, m);
    }
    const arr = m.get(day) ?? [];
    arr.push(Number(s.price_usd));
    m.set(day, arr);
  }
  for (const [cid, m] of dailyByCard) {
    sparkByCard.set(
      cid,
      Array.from(m.entries())
        .map(([ts, prices]) => ({
          ts,
          value: prices.reduce((a, b) => a + b, 0) / prices.length,
        }))
        .sort((a, b) => a.ts - b.ts),
    );
  }

  // 4) Build rows.
  const seededRows: Row[] = [];
  for (const w of watchlist) {
    const card = cardsMap.get(w.card_id);
    if (!card) continue;
    const a = analyticsByCard.get(w.card_id);
    seededRows.push({
      card_id: w.card_id,
      player_name: card.player_name,
      card_subtitle: `${card.release_year} ${card.release_name} · ${card.set_name} · #${card.card_number}`,
      release_year: card.release_year,
      is_rookie: card.is_rookie,
      image_url: card.image_url ?? null,
      added_at: w.added_at,
      notes: w.notes,
      target_buy_usd: w.target_buy_usd != null ? Number(w.target_buy_usd) : null,
      target_sell_usd: w.target_sell_usd != null ? Number(w.target_sell_usd) : null,
      vwap_30d_usd: a?.vwap_30d_usd != null ? Number(a.vwap_30d_usd) : null,
      vwap_7d_usd: a?.vwap_7d_usd != null ? Number(a.vwap_7d_usd) : null,
      vwap_90d_usd: a?.vwap_90d_usd != null ? Number(a.vwap_90d_usd) : null,
      psa10_30d_usd:
        a?.psa10_vwap_30d_usd != null ? Number(a.psa10_vwap_30d_usd) : null,
      psa9_90d_usd: null,
      psa10_to_psa9_multiple: null,
      momentum: a?.momentum_score != null ? Number(a.momentum_score) : null,
      sales_30d: a?.sales_count_30d != null ? Number(a.sales_count_30d) : null,
      spark: sparkByCard.get(w.card_id) ?? [],
    });
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-[1600px] mx-auto">
      <nav className="text-xs font-mono uppercase tracking-[0.08em] text-muted mb-6">
        <Link href="/" className="hover:text-fg transition-colors duration-150">
          Market
        </Link>
        <span className="mx-2 text-muted-2">/</span>
        <span className="text-fg-2">Watchlist</span>
      </nav>
      <WatchlistTable seededRows={seededRows} otherRows={[]} />
    </div>
  );
}
