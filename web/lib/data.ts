// Data layer - Supabase-backed. Replaces the old mock.ts.
//
// All exports are async because they hit Supabase. Page server components
// (Next.js App Router) handle this naturally with `await`. No mock data,
// no fallbacks: if Supabase has it, you see it; if it doesn't, the page
// shows an empty state.
//
// Anything mock-only (analyst-coded `thesis` text, the `heat` flag, fake
// `baseline_psa10` baselines) is gone. Things that came from mock but are
// genuinely editorial content (player bios, news headlines) stay as static
// data - see PLAYER_BIOS below and ./news.ts.

import { unstable_cache } from "next/cache";
import { supabase } from "./supabase";
import { NEWS } from "./news";

// ─────────────────────────────────────────────────────────────────────
// Shared types - keeping shapes close to old mock so callsites need
// minimal changes. The biggest difference: most reads are async.
// ─────────────────────────────────────────────────────────────────────

export type Sport = "Baseball" | "Basketball" | "Football";

export type Card = {
  id: string;                 // CardSight UUID
  player_name: string;
  card_number: string;
  is_rookie: boolean;
  release_year: string;
  release_name: string;
  set_name: string;
  sport: Sport;
  image_url?: string | null;
};

export type Sale = {
  id: number;
  card_id: string;
  sold_at: string;
  price_usd: number;
  is_graded: boolean;
  grader: string | null;
  grade_value: string | null;
  source: string;
  external_url: string | null;
  external_title: string | null;
  listing_type: string | null;
  image_url?: string | null;
  parallel_id?: string | null;
  parallel_name?: string | null;
};

export type AnalyticsRow = {
  card_id: string;
  snapshot_date: string;
  vwap_7d_usd: number | null;
  vwap_30d_usd: number | null;
  vwap_90d_usd: number | null;
  raw_vwap_30d_usd: number | null;
  psa10_vwap_30d_usd: number | null;
  // Multi-grade tier prices computed in app code from sales (analytics_daily
  // doesn't store per-grade VWAPs yet - mock did, real schema doesn't).
  psa9_vwap_90d_usd: number | null;
  bgs9_vwap_90d_usd: number | null;
  bgs95_vwap_90d_usd: number | null;
  bgs10_vwap_90d_usd: number | null;
  psa10_to_psa9_multiple: number | null;
  bgs95_to_bgs9_multiple: number | null;
  bgs10_to_bgs95_multiple: number | null;
  sales_count_30d: number | null;
  velocity_score: number | null;
  scarcity_score: number | null;
  gem_rate: number | null;
  momentum_score: number | null;
  // The old mock had these; we no longer fake them.
  // confidence + thesis come from a tiny static map for the seeded picks
  // (not stored in DB; kept here so the Signal page still has copy).
  confidence?: "high" | "medium" | "low" | "insufficient";
  thesis?: string | null;
};

export type ActiveListing = {
  id: number;
  card_id: string;
  observed_at: string;
  price_usd: number;
  listing_type: "auction" | "fixed" | "best_offer" | "search";
  source: string;
  /** Where the row came from: "cardsight" (via CardSight /marketplace) or
   *  "ebay-browse" (via eBay Browse API directly). Visible to the user as
   *  a small badge so they can see we cross-check two independent sources. */
  source_system: string | null;
  external_url: string | null;
  external_title: string | null;
  image_url: string | null;
  condition_raw: string | null;
  is_graded: boolean;
  grader: string | null;
  grade_value: string | null;
  end_date: string | null;
  bid_count: number | null;
  parallel_id: string | null;
  parallel_name: string | null;
};

export type WatchlistEntry = {
  card_id: string;
  added_at: string;
  target_buy_usd: number | null;
  target_sell_usd: number | null;
  notes: string | null;
};

export type WatchEntry = WatchlistEntry & {
  card: Card;
  analytics: AnalyticsRow | null;
};

export type Player = {
  slug: string;
  name: string;
  sport: Sport;
  is_rookie: boolean;
  cards: Card[];
  avg_psa10_30d: number | null;
  avg_psa10_simple: number | null;
  avg_psa10_median: number | null;
  avg_psa10_90d: number | null;
  avg_psa10_7d: number | null;
  avg_psa10_90d_simple: number | null;
  sales_30d: number;
  sales_7d: number;
  sales_90d: number;
  momentum: number | null;
  momentum_30v90: number | null;
  best_signal: number;
};

export type CardDetail = {
  card: Card;
  sales: Sale[];
  analytics: AnalyticsRow | null;
};

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function playerSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const ALLOWED_GRADERS = new Set(["PSA", "BGS"]);

const SEGMENT_ID_TO_SPORT: Record<string, Sport> = {
  "671e78da-64d2-45a4-8082-6682b2ae0e19": "Baseball",
  "ac331a5c-ee1e-43fb-a10c-e59d249be7b7": "Basketball",
  "5b86ca75-c5be-4621-aca1-57bd4f6dd111": "Football",
};

// Per-request memo (each Next.js render re-loads modules, so this is naturally
// scoped). Keeps a single page-render from making the same query twice.
type Memo = {
  releases?: Map<string, { id: string; year: string; name: string; sport: Sport }>;
  sets?: Map<string, { id: string; name: string }>;
};
const _memo: Memo = {};

// Raw row fetchers cached with unstable_cache (Map doesn't JSON-serialize, so
// we cache the array form and build the Map fresh per render). Releases and
// sets change ~weekly when new releases load, so 1h cache is generous.
const _fetchReleasesRaw = unstable_cache(
  async () => {
    const sb = supabase();
    const { data } = await sb.from("releases").select("id, year, name, segment_id");
    return data || [];
  },
  ["releases-raw"],
  { revalidate: 3600 },
);

const _fetchSetsRaw = unstable_cache(
  async () => {
    const sb = supabase();
    const { data } = await sb.from("sets").select("id, name");
    return data || [];
  },
  ["sets-raw"],
  { revalidate: 3600 },
);

async function loadReleaseLookup() {
  if (_memo.releases) return _memo.releases;
  const data = await _fetchReleasesRaw();
  const map = new Map<string, { id: string; year: string; name: string; sport: Sport }>();
  for (const r of data) {
    map.set(r.id, {
      id: r.id,
      year: r.year,
      name: r.name,
      sport: SEGMENT_ID_TO_SPORT[r.segment_id] ?? "Baseball",
    });
  }
  _memo.releases = map;
  return map;
}

async function loadSetLookup() {
  if (_memo.sets) return _memo.sets;
  const data = await _fetchSetsRaw();
  const map = new Map<string, { id: string; name: string }>();
  for (const s of data) map.set(s.id, { id: s.id, name: s.name });
  _memo.sets = map;
  return map;
}

function rowToCard(
  row: any,
  releases: Map<string, { id: string; year: string; name: string; sport: Sport }>,
  sets: Map<string, { id: string; name: string }>,
): Card {
  const release = releases.get(row.release_id);
  const set = sets.get(row.set_id);
  return {
    id: row.id,
    player_name: row.player_name,
    card_number: row.card_number ?? "?",
    is_rookie: !!row.is_rookie,
    release_year: release?.year ?? "?",
    release_name: release?.name ?? "?",
    set_name: set?.name ?? "?",
    sport: release?.sport ?? "Baseball",
    image_url: row.image_url ?? null,
  };
}

function rowToSale(row: any): Sale {
  return {
    id: row.id,
    card_id: row.card_id,
    sold_at: row.sold_at,
    price_usd: Number(row.price_usd),
    is_graded: !!row.is_graded,
    grader: row.grader,
    grade_value: row.grade_value,
    source: row.source,
    external_url: row.external_url,
    external_title: row.external_title,
    listing_type: row.listing_type,
    image_url: row.image_url,
    parallel_id: row.parallel_id ?? null,
    parallel_name: row.parallel_name ?? null,
  };
}

// Pull all sales for a list of card_ids, paginated.
async function fetchSalesForCards(cardIds: string[]): Promise<Sale[]> {
  if (cardIds.length === 0) return [];
  const sb = supabase();
  const out: Sale[] = [];
  for (let i = 0; i < cardIds.length; i += 200) {
    const chunk = cardIds.slice(i, i + 200);
    let offset = 0;
    while (true) {
      const { data } = await sb
        .from("sales")
        .select(
          "id, card_id, sold_at, price_usd, is_graded, grader, grade_value, source, external_url, external_title, listing_type, image_url, parallel_id, parallel_name",
        )
        .in("card_id", chunk)
        .order("sold_at", { ascending: false })
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      out.push(...data.map(rowToSale));
      if (data.length < 1000) break;
      offset += 1000;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Card lookups
// ─────────────────────────────────────────────────────────────────────

export async function getCard(id: string): Promise<CardDetail | null> {
  const sb = supabase();
  const { data, error } = await sb
    .from("card_identity")
    .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const card = rowToCard(data, releases, sets);
  const sales = await fetchSalesForCards([id]);
  const analytics = await getAnalytics(id);
  return { card, sales, analytics };
}

export async function getCardsByIds(ids: string[]): Promise<Map<string, Card>> {
  if (ids.length === 0) return new Map();
  const sb = supabase();
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const out = new Map<string, Card>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await sb
      .from("card_identity")
      .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
      .in("id", chunk);
    for (const r of data || []) {
      out.set(r.id, rowToCard(r, releases, sets));
    }
  }
  return out;
}

export async function getVariations(cardId: string): Promise<Card[]> {
  const sb = supabase();
  const { data: target } = await sb
    .from("card_identity")
    .select("player_name")
    .eq("id", cardId)
    .maybeSingle();
  if (!target) return [];
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const { data } = await sb
    .from("card_identity")
    .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
    .eq("player_name", target.player_name)
    .neq("id", cardId)
    .limit(60);
  return (data || []).map((r) => rowToCard(r, releases, sets));
}

// ─────────────────────────────────────────────────────────────────────
// Sales + sparkline
// ─────────────────────────────────────────────────────────────────────

export async function salesForCard(cardId: string): Promise<Sale[]> {
  return fetchSalesForCards([cardId]);
}

/** Daily VWAP sparkline for one card over the last `days` days. PSA + BGS only. */
async function _getSparklineImpl(
  cardId: string,
  days: number = 30,
): Promise<{ ts: number; value: number }[]> {
  // Read from the pre-aggregated `price_snapshots` table instead of
  // scanning all sales for the card. price_snapshots already has
  // per-day VWAP per (card, grader, grade) — we union PSA + BGS for
  // the legacy "graded combined" sparkline.
  //
  // Falls back to the sales-scan path only if price_snapshots is empty
  // for this card (e.g., card priced today before the daily snapshot ran).
  const sb = supabase();
  const cutoffISO = new Date(Date.now() - days * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  let { data } = await sb
    .from("price_snapshots")
    .select("snapshot_date, sale_count, sum_price_usd")
    .eq("card_id", cardId)
    .gte("snapshot_date", cutoffISO)
    .in("grader", ["PSA", "BGS"]);

  // Fallback: if graded snapshots are empty for this card, try ALL graders
  // (raw, SGC, CGC, etc) so the sparkline isn't flat just because the card
  // doesn't trade in PSA/BGS.
  if (!data || data.length === 0) {
    const r = await sb
      .from("price_snapshots")
      .select("snapshot_date, sale_count, sum_price_usd")
      .eq("card_id", cardId)
      .gte("snapshot_date", cutoffISO);
    data = r.data;
  }

  if (data && data.length > 0) {
    // Group by date, weighted average across PSA + BGS for that day.
    const byDay = new Map<string, { sum: number; n: number }>();
    for (const r of data) {
      const acc = byDay.get(r.snapshot_date) ?? { sum: 0, n: 0 };
      acc.sum += Number(r.sum_price_usd);
      acc.n += Number(r.sale_count);
      byDay.set(r.snapshot_date, acc);
    }
    return Array.from(byDay.entries())
      .filter(([, v]) => v.n > 0)
      .map(([dateStr, v]) => ({
        ts: new Date(dateStr).getTime(),
        value: Number((v.sum / v.n).toFixed(2)),
      }))
      .sort((a, b) => a.ts - b.ts);
  }

  // Fallback: scan sales (covers cards priced today, no snapshot yet)
  const sales = await fetchSalesForCards([cardId]);
  const cutoff = Date.now() - days * 86400 * 1000;
  const byDay = new Map<number, number[]>();
  for (const s of sales) {
    if (!s.is_graded || !s.grader || !ALLOWED_GRADERS.has(s.grader)) continue;
    const t = new Date(s.sold_at).getTime();
    if (t < cutoff) continue;
    const day = Math.floor(t / 86400000) * 86400000;
    const arr = byDay.get(day) ?? [];
    arr.push(s.price_usd);
    byDay.set(day, arr);
  }
  return Array.from(byDay.entries())
    .map(([ts, prices]) => ({
      ts,
      value: prices.reduce((a, b) => a + b, 0) / prices.length,
    }))
    .sort((a, b) => a.ts - b.ts);
}

// Per-card sparkline cache. 10min - covers home gem-pick grid + card detail.
export const getSparkline = unstable_cache(_getSparklineImpl, ["card-sparkline"], {
  revalidate: 600,
});

// ─────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────

export async function getAnalytics(cardId: string): Promise<AnalyticsRow | null> {
  const sb = supabase();
  const { data } = await sb
    .from("analytics_daily")
    .select(
      "card_id, snapshot_date, vwap_7d_usd, vwap_30d_usd, vwap_90d_usd, raw_vwap_30d_usd, psa10_vwap_30d_usd, sales_count_30d, velocity_score, scarcity_score, gem_rate, momentum_score",
    )
    .eq("card_id", cardId)
    .order("snapshot_date", { ascending: false })
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    card_id: row.card_id,
    snapshot_date: row.snapshot_date,
    vwap_7d_usd: row.vwap_7d_usd ? Number(row.vwap_7d_usd) : null,
    vwap_30d_usd: row.vwap_30d_usd ? Number(row.vwap_30d_usd) : null,
    vwap_90d_usd: row.vwap_90d_usd ? Number(row.vwap_90d_usd) : null,
    raw_vwap_30d_usd: row.raw_vwap_30d_usd ? Number(row.raw_vwap_30d_usd) : null,
    psa10_vwap_30d_usd: row.psa10_vwap_30d_usd ? Number(row.psa10_vwap_30d_usd) : null,
    psa9_vwap_90d_usd: null,
    bgs9_vwap_90d_usd: null,
    bgs95_vwap_90d_usd: null,
    bgs10_vwap_90d_usd: null,
    psa10_to_psa9_multiple: null,
    bgs95_to_bgs9_multiple: null,
    bgs10_to_bgs95_multiple: null,
    sales_count_30d: row.sales_count_30d ? Number(row.sales_count_30d) : null,
    velocity_score: row.velocity_score ? Number(row.velocity_score) : null,
    scarcity_score: row.scarcity_score ? Number(row.scarcity_score) : null,
    gem_rate: row.gem_rate ? Number(row.gem_rate) : null,
    momentum_score: row.momentum_score ? Number(row.momentum_score) : null,
    confidence: undefined,
    thesis: null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Per-grade pricing (price_snapshots) — daily VWAP per (card, date, grader, grade).
// Populated by src/per_grade_snapshots.py. Lets the card detail page show
// PSA 9 / PSA 10 / BGS 9.5 / BGS 10 / Raw broken out separately, instead
// of the two pre-baked buckets analytics_daily exposes.
// ─────────────────────────────────────────────────────────────────────

export type GradeBucket = {
  grader: string;
  grade_value: string;
  vwap_30d: number | null;
  vwap_90d: number | null;
  median_30d: number | null;
  sales_30d: number;
  sales_90d: number;
  last_sale_date: string | null;
};

export async function getPerGradeBuckets(cardId: string): Promise<GradeBucket[]> {
  const sb = supabase();
  // Pull all snapshots for this card, last 90 days. Group in JS by grade.
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("price_snapshots")
    .select("grader, grade_value, snapshot_date, sale_count, sum_price_usd, vwap_usd, median_usd")
    .eq("card_id", cardId)
    .gte("snapshot_date", cutoff)
    .order("snapshot_date", { ascending: false });

  // Group by (grader, grade_value)
  type Acc = {
    sum30: number; n30: number; sum90: number; n90: number;
    medians30: number[]; lastDate: string | null;
  };
  const groups = new Map<string, Acc>();
  const cutoff30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

  for (const row of data || []) {
    const key = `${row.grader}|${row.grade_value}`;
    let acc = groups.get(key);
    if (!acc) {
      acc = { sum30: 0, n30: 0, sum90: 0, n90: 0, medians30: [], lastDate: null };
      groups.set(key, acc);
    }
    const cnt = Number(row.sale_count);
    const sum = Number(row.sum_price_usd);
    const med = row.median_usd != null ? Number(row.median_usd) : null;
    acc.sum90 += sum;
    acc.n90 += cnt;
    if (row.snapshot_date >= cutoff30) {
      acc.sum30 += sum;
      acc.n30 += cnt;
      if (med !== null) acc.medians30.push(med);
    }
    if (!acc.lastDate || row.snapshot_date > acc.lastDate) {
      acc.lastDate = row.snapshot_date;
    }
  }

  const out: GradeBucket[] = [];
  for (const [key, acc] of groups) {
    const [grader, grade_value] = key.split("|");
    const vwap30 = acc.n30 > 0 ? acc.sum30 / acc.n30 : null;
    const vwap90 = acc.n90 > 0 ? acc.sum90 / acc.n90 : null;
    const median30 = acc.medians30.length
      ? acc.medians30.sort((a, b) => a - b)[Math.floor(acc.medians30.length / 2)]
      : null;
    out.push({
      grader,
      grade_value,
      vwap_30d: vwap30,
      vwap_90d: vwap90,
      median_30d: median30,
      sales_30d: acc.n30,
      sales_90d: acc.n90,
      last_sale_date: acc.lastDate,
    });
  }
  // Sort descending by 30-day vwap (ungraded last)
  out.sort((a, b) => (b.vwap_30d ?? 0) - (a.vwap_30d ?? 0));
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Active listings (separate from sales - what's available to BUY right now)
// Populated by src/refresh_active_listings.py via CardSight /marketplace.
// ─────────────────────────────────────────────────────────────────────

export async function getActiveListings(cardId: string): Promise<ActiveListing[]> {
  const sb = supabase();
  const { data } = await sb
    .from("active_listings")
    .select(
      "id, card_id, observed_at, price_usd, listing_type, source, source_system, external_url, external_title, image_url, condition_raw, is_graded, grader, grade_value, end_date, bid_count, parallel_id, parallel_name",
    )
    .eq("card_id", cardId)
    .order("price_usd", { ascending: true });
  return (data || []).map((r) => ({
    id: Number(r.id),
    card_id: r.card_id,
    observed_at: r.observed_at,
    price_usd: Number(r.price_usd),
    listing_type: r.listing_type,
    source: r.source,
    source_system: r.source_system ?? null,
    external_url: r.external_url,
    external_title: r.external_title,
    image_url: r.image_url,
    condition_raw: r.condition_raw,
    is_graded: !!r.is_graded,
    grader: r.grader,
    grade_value: r.grade_value,
    end_date: r.end_date,
    bid_count: r.bid_count != null ? Number(r.bid_count) : null,
    parallel_id: r.parallel_id ?? null,
    parallel_name: r.parallel_name ?? null,
  }));
}

/** Batch fetch the latest analytics row for many cards in one query. Returns
 *  a Map keyed by card_id. Use when rendering tables of N cards (variations,
 *  watchlist, signal) - keeps page renders to one DB hit instead of N. */
export async function getAnalyticsForCards(
  cardIds: string[],
): Promise<Map<string, AnalyticsRow>> {
  const out = new Map<string, AnalyticsRow>();
  if (cardIds.length === 0) return out;
  const sb = supabase();
  for (let i = 0; i < cardIds.length; i += 200) {
    const chunk = cardIds.slice(i, i + 200);
    const { data } = await sb
      .from("analytics_daily")
      .select(
        "card_id, snapshot_date, vwap_7d_usd, vwap_30d_usd, vwap_90d_usd, raw_vwap_30d_usd, psa10_vwap_30d_usd, sales_count_30d, velocity_score, scarcity_score, gem_rate, momentum_score",
      )
      .in("card_id", chunk);
    for (const row of data || []) {
      // analytics_daily can have multiple rows per card (one per snapshot day).
      // Keep the most recent.
      const prev = out.get(row.card_id);
      if (prev && prev.snapshot_date && row.snapshot_date <= prev.snapshot_date) continue;
      out.set(row.card_id, {
        card_id: row.card_id,
        snapshot_date: row.snapshot_date,
        vwap_7d_usd: row.vwap_7d_usd ? Number(row.vwap_7d_usd) : null,
        vwap_30d_usd: row.vwap_30d_usd ? Number(row.vwap_30d_usd) : null,
        vwap_90d_usd: row.vwap_90d_usd ? Number(row.vwap_90d_usd) : null,
        raw_vwap_30d_usd: row.raw_vwap_30d_usd ? Number(row.raw_vwap_30d_usd) : null,
        psa10_vwap_30d_usd: row.psa10_vwap_30d_usd ? Number(row.psa10_vwap_30d_usd) : null,
        psa9_vwap_90d_usd: null,
        bgs9_vwap_90d_usd: null,
        bgs95_vwap_90d_usd: null,
        bgs10_vwap_90d_usd: null,
        psa10_to_psa9_multiple: null,
        bgs95_to_bgs9_multiple: null,
        bgs10_to_bgs95_multiple: null,
        sales_count_30d: row.sales_count_30d ? Number(row.sales_count_30d) : null,
        velocity_score: row.velocity_score ? Number(row.velocity_score) : null,
        scarcity_score: row.scarcity_score ? Number(row.scarcity_score) : null,
        gem_rate: row.gem_rate ? Number(row.gem_rate) : null,
        momentum_score: row.momentum_score ? Number(row.momentum_score) : null,
        confidence: undefined,
        thesis: null,
      });
    }
  }
  return out;
}

export async function getAllAnalytics(): Promise<AnalyticsRow[]> {
  const sb = supabase();
  const out: AnalyticsRow[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("analytics_daily")
      .select("*")
      .order("sales_count_30d", { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const row of data) {
      out.push({
        card_id: row.card_id,
        snapshot_date: row.snapshot_date,
        vwap_7d_usd: row.vwap_7d_usd ? Number(row.vwap_7d_usd) : null,
        vwap_30d_usd: row.vwap_30d_usd ? Number(row.vwap_30d_usd) : null,
        vwap_90d_usd: row.vwap_90d_usd ? Number(row.vwap_90d_usd) : null,
        raw_vwap_30d_usd: row.raw_vwap_30d_usd ? Number(row.raw_vwap_30d_usd) : null,
        psa10_vwap_30d_usd: row.psa10_vwap_30d_usd ? Number(row.psa10_vwap_30d_usd) : null,
        psa9_vwap_90d_usd: null,
        bgs9_vwap_90d_usd: null,
        bgs95_vwap_90d_usd: null,
        bgs10_vwap_90d_usd: null,
        psa10_to_psa9_multiple: null,
        bgs95_to_bgs9_multiple: null,
        bgs10_to_bgs95_multiple: null,
        sales_count_30d: row.sales_count_30d ? Number(row.sales_count_30d) : null,
        velocity_score: row.velocity_score ? Number(row.velocity_score) : null,
        scarcity_score: row.scarcity_score ? Number(row.scarcity_score) : null,
        gem_rate: row.gem_rate ? Number(row.gem_rate) : null,
        momentum_score: row.momentum_score ? Number(row.momentum_score) : null,
        confidence: undefined,
        thesis: null,
      });
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Watchlist
// ─────────────────────────────────────────────────────────────────────

export async function getWatchlist(): Promise<WatchEntry[]> {
  const sb = supabase();
  const { data } = await sb
    .from("watchlist")
    .select("card_id, added_at, target_buy_usd, target_sell_usd, notes");
  if (!data || data.length === 0) return [];
  const ids = data.map((w) => w.card_id);
  const cards = await getCardsByIds(ids);
  const out: WatchEntry[] = [];
  for (const w of data) {
    const card = cards.get(w.card_id);
    if (!card) continue;
    const analytics = await getAnalytics(w.card_id);
    out.push({
      card_id: w.card_id,
      added_at: w.added_at,
      target_buy_usd: w.target_buy_usd != null ? Number(w.target_buy_usd) : null,
      target_sell_usd: w.target_sell_usd != null ? Number(w.target_sell_usd) : null,
      notes: w.notes,
      card,
      analytics,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Players
// ─────────────────────────────────────────────────────────────────────

/** Build a Player record by aggregating one player's cards + analytics. */
async function buildPlayer(
  name: string,
  cardsForPlayer: Card[],
  analyticsByCard: Map<string, AnalyticsRow>,
): Promise<Player> {
  const cards = cardsForPlayer;
  const cardData = cards.map((c) => {
    const a = analyticsByCard.get(c.id);
    return {
      psa10_30: a?.psa10_vwap_30d_usd ?? null,
      vwap_7: a?.vwap_7d_usd ?? null,
      vwap_90: a?.vwap_90d_usd ?? null,
      momentum: a?.momentum_score ?? null,
      weight: a?.sales_count_30d ?? 0,
    };
  });

  const weightedAvg = (
    values: { value: number | null; weight: number }[],
  ): number | null => {
    const valid = values.filter((v) => v.value != null && v.weight > 0);
    if (valid.length === 0) {
      const fb = values
        .map((v) => v.value)
        .filter((v): v is number => v != null);
      if (fb.length === 0) return null;
      return fb.reduce((a, b) => a + b, 0) / fb.length;
    }
    const totalW = valid.reduce((a, v) => a + v.weight, 0);
    return valid.reduce((a, v) => a + (v.value as number) * v.weight, 0) / totalW;
  };

  const avg30 = weightedAvg(cardData.map((d) => ({ value: d.psa10_30, weight: d.weight })));
  const avg7 = weightedAvg(cardData.map((d) => ({ value: d.vwap_7, weight: d.weight })));
  const avg90 = weightedAvg(cardData.map((d) => ({ value: d.vwap_90, weight: d.weight })));
  const momentum = weightedAvg(
    cardData.map((d) => ({ value: d.momentum, weight: d.weight })),
  );

  const validP10 = cardData.map((d) => d.psa10_30).filter((v): v is number => v != null);
  const simpleAvg = validP10.length
    ? validP10.reduce((a, b) => a + b, 0) / validP10.length
    : null;
  const sortedP10 = [...validP10].sort((a, b) => a - b);
  const median = sortedP10.length
    ? sortedP10.length % 2
      ? sortedP10[(sortedP10.length - 1) / 2]
      : (sortedP10[sortedP10.length / 2 - 1] + sortedP10[sortedP10.length / 2]) / 2
    : null;

  const valid90 = cardData.map((d) => d.vwap_90).filter((v): v is number => v != null);
  const simple90 = valid90.length ? valid90.reduce((a, b) => a + b, 0) / valid90.length : null;

  const sales30 = cardData.reduce((s, d) => s + d.weight, 0);
  // Approximations - analytics_daily only stores sales_count_30d.
  const sales7 = Math.round(sales30 / 4);
  const sales90 = Math.round(sales30 * 2.5);

  return {
    slug: playerSlug(name),
    name,
    sport: cards[0].sport,
    is_rookie: cards.some((c) => c.is_rookie),
    cards,
    avg_psa10_30d: avg30 != null ? Math.round(avg30 * 100) / 100 : null,
    avg_psa10_simple: simpleAvg != null ? Math.round(simpleAvg * 100) / 100 : null,
    avg_psa10_median: median != null ? Math.round(median * 100) / 100 : null,
    avg_psa10_90d: avg90 != null ? Math.round(avg90 * 100) / 100 : null,
    avg_psa10_7d: avg7 != null ? Math.round(avg7 * 100) / 100 : null,
    avg_psa10_90d_simple: simple90 != null ? Math.round(simple90 * 100) / 100 : null,
    sales_30d: sales30,
    sales_7d: sales7,
    sales_90d: sales90,
    momentum: momentum != null ? Number(momentum.toFixed(4)) : null,
    momentum_30v90: null,
    best_signal: 0,
  };
}

/** Players with at least one card-with-sales - keeps the list manageable. */
async function _getPlayersImpl(): Promise<Player[]> {
  const sb = supabase();
  // Find active players: at least one card with sales_count_30d > 0 in
  // analytics_daily. Otherwise the list would have 3,000+ names mostly
  // with zero data.
  //
  // Pull EVERY analytics field in this single query (was: small projection
  // here, then a second 10-chunk re-fetch for the same IDs further down).
  const { data: activeAnalytics } = await sb
    .from("analytics_daily")
    .select(
      "card_id, snapshot_date, vwap_7d_usd, vwap_30d_usd, vwap_90d_usd, raw_vwap_30d_usd, psa10_vwap_30d_usd, sales_count_30d, velocity_score, scarcity_score, gem_rate, momentum_score",
    )
    .gt("sales_count_30d", 0)
    .order("sales_count_30d", { ascending: false })
    .limit(2000);
  const activeCardIds = (activeAnalytics || []).map((a) => a.card_id);
  if (activeCardIds.length === 0) return [];
  const cards = await getCardsByIds(activeCardIds);
  const analyticsByCard = new Map<string, AnalyticsRow>();
  for (const a of activeAnalytics || []) {
    analyticsByCard.set(a.card_id, {
      card_id: a.card_id,
      snapshot_date: a.snapshot_date,
      vwap_7d_usd: a.vwap_7d_usd != null ? Number(a.vwap_7d_usd) : null,
      vwap_30d_usd: a.vwap_30d_usd != null ? Number(a.vwap_30d_usd) : null,
      vwap_90d_usd: a.vwap_90d_usd != null ? Number(a.vwap_90d_usd) : null,
      raw_vwap_30d_usd: a.raw_vwap_30d_usd != null ? Number(a.raw_vwap_30d_usd) : null,
      psa10_vwap_30d_usd: a.psa10_vwap_30d_usd != null ? Number(a.psa10_vwap_30d_usd) : null,
      psa9_vwap_90d_usd: null,
      bgs9_vwap_90d_usd: null,
      bgs95_vwap_90d_usd: null,
      bgs10_vwap_90d_usd: null,
      psa10_to_psa9_multiple: null,
      bgs95_to_bgs9_multiple: null,
      bgs10_to_bgs95_multiple: null,
      sales_count_30d: a.sales_count_30d != null ? Number(a.sales_count_30d) : null,
      velocity_score: a.velocity_score != null ? Number(a.velocity_score) : null,
      scarcity_score: a.scarcity_score != null ? Number(a.scarcity_score) : null,
      gem_rate: a.gem_rate != null ? Number(a.gem_rate) : null,
      momentum_score: a.momentum_score != null ? Number(a.momentum_score) : null,
    });
  }
  // Group cards by player_name
  const byName = new Map<string, Card[]>();
  for (const c of cards.values()) {
    const list = byName.get(c.player_name) ?? [];
    list.push(c);
    byName.set(c.player_name, list);
  }
  const players: Player[] = [];
  for (const [name, list] of byName) {
    if (!name || name === "?" || name.includes("Variation")) continue;
    players.push(await buildPlayer(name, list, analyticsByCard));
  }
  return players;
}

// Active-player list shifts as analytics_daily updates (daily cron). 5min
// cache: first user pays the load cost, next 300s of users hit cache.
export const getPlayers = unstable_cache(_getPlayersImpl, ["players-active"], {
  revalidate: 300,
});

async function _getPlayerImpl(slug: string): Promise<Player | null> {
  const sb = supabase();
  // Resolve slug -> player_name(s) via an indexed ILIKE lookup. Slug rule:
  // lowercase, non-alphanumeric runs collapse to "-". Reverse it by
  // turning the slug into an ILIKE pattern with "%" between segments.
  // E.g. "mike-trout" -> "mike%trout%" matches "Mike Trout" but not the
  // 149K-row table scan the old code did.
  const ilikePattern = slug.replace(/-/g, "%") + "%";
  const { data: candidates } = await sb
    .from("card_identity")
    .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
    .ilike("player_name", ilikePattern)
    .limit(5000);

  // Filter to the exact slug match (ILIKE is loose; `mike-trout` could
  // false-positive on `Mike Troutman` etc).
  const rows = (candidates || []).filter(
    (r) => playerSlug(r.player_name || "") === slug,
  );
  if (rows.length === 0) return null;

  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const cards = rows.map((r) => rowToCard(r, releases, sets));

  // Single chunked analytics fetch - no N+1 re-fetch this time.
  const analyticsByCard = new Map<string, AnalyticsRow>();
  const ids = cards.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: aData } = await sb
      .from("analytics_daily")
      .select(
        "card_id, snapshot_date, vwap_7d_usd, vwap_30d_usd, vwap_90d_usd, raw_vwap_30d_usd, psa10_vwap_30d_usd, sales_count_30d, velocity_score, scarcity_score, gem_rate, momentum_score",
      )
      .in("card_id", chunk);
    for (const a of aData || []) {
      analyticsByCard.set(a.card_id, {
        card_id: a.card_id,
        snapshot_date: a.snapshot_date,
        vwap_7d_usd: a.vwap_7d_usd != null ? Number(a.vwap_7d_usd) : null,
        vwap_30d_usd: a.vwap_30d_usd != null ? Number(a.vwap_30d_usd) : null,
        vwap_90d_usd: a.vwap_90d_usd != null ? Number(a.vwap_90d_usd) : null,
        raw_vwap_30d_usd: a.raw_vwap_30d_usd != null ? Number(a.raw_vwap_30d_usd) : null,
        psa10_vwap_30d_usd: a.psa10_vwap_30d_usd != null ? Number(a.psa10_vwap_30d_usd) : null,
        psa9_vwap_90d_usd: null,
        bgs9_vwap_90d_usd: null,
        bgs95_vwap_90d_usd: null,
        bgs10_vwap_90d_usd: null,
        psa10_to_psa9_multiple: null,
        bgs95_to_bgs9_multiple: null,
        bgs10_to_bgs95_multiple: null,
        sales_count_30d: a.sales_count_30d != null ? Number(a.sales_count_30d) : null,
        velocity_score: a.velocity_score != null ? Number(a.velocity_score) : null,
        scarcity_score: a.scarcity_score != null ? Number(a.scarcity_score) : null,
        gem_rate: a.gem_rate != null ? Number(a.gem_rate) : null,
        momentum_score: a.momentum_score != null ? Number(a.momentum_score) : null,
      });
    }
  }
  return buildPlayer(rows[0].player_name || "", cards, analyticsByCard);
}

// Per-player resolution. 5min cache - first visitor warms it, the rest
// (including bots / scrapers / analytics) hit cache.
export const getPlayer = unstable_cache(_getPlayerImpl, ["player-by-slug"], {
  revalidate: 300,
});

export async function getPlayerSales(slug: string): Promise<Sale[]> {
  const player = await getPlayer(slug);
  if (!player) return [];
  return fetchSalesForCards(player.cards.map((c) => c.id));
}

async function _getPlayerSparklineByCardIdsImpl(
  cardIds: string[],
  days: number = 30,
): Promise<{ ts: number; value: number }[]> {
  // Direct path: caller already knows the card IDs. The slug-based
  // getPlayerSparkline below has to re-resolve slug -> name -> cards via
  // a paginated full-table scan, which is fine for the player detail
  // page but blows the 30s edge budget when the home page calls it
  // 10× in parallel (one per mover).
  //
  // Filter strategy: PSA 10 preferred, but fall back to all-graded if
  // the player has no PSA 10 snapshots (otherwise sparklines render
  // flat for any player whose cards trade in PSA 9 / BGS / raw).
  if (!cardIds.length) return [];
  const sb = supabase();
  const cutoffISO = new Date(Date.now() - days * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  type Row = { snapshot_date: string; sale_count: number; sum_price_usd: number };

  async function fetchSnapshots(filter: "psa10" | "graded" | "all"): Promise<Row[]> {
    const out: Row[] = [];
    for (let i = 0; i < cardIds.length; i += 200) {
      const chunk = cardIds.slice(i, i + 200);
      let q = sb
        .from("price_snapshots")
        .select("snapshot_date, sale_count, sum_price_usd")
        .in("card_id", chunk)
        .gte("snapshot_date", cutoffISO);
      if (filter === "psa10") {
        q = q.eq("grader", "PSA").eq("grade_value", "10");
      } else if (filter === "graded") {
        q = q.in("grader", ["PSA", "BGS"]);
      }
      const { data } = await q;
      for (const r of data || []) {
        out.push({
          snapshot_date: r.snapshot_date,
          sale_count: Number(r.sale_count),
          sum_price_usd: Number(r.sum_price_usd),
        });
      }
    }
    return out;
  }

  let all = await fetchSnapshots("psa10");
  if (all.length < 2) all = await fetchSnapshots("graded");
  if (all.length < 2) all = await fetchSnapshots("all");

  const byDay = new Map<string, { sum: number; n: number }>();
  for (const r of all) {
    const acc = byDay.get(r.snapshot_date) ?? { sum: 0, n: 0 };
    acc.sum += r.sum_price_usd;
    acc.n += r.sale_count;
    byDay.set(r.snapshot_date, acc);
  }
  return Array.from(byDay.entries())
    .filter(([, v]) => v.n > 0)
    .map(([date, v]) => ({
      ts: new Date(date).getTime(),
      value: Number((v.sum / v.n).toFixed(2)),
    }))
    .sort((a, b) => a.ts - b.ts);
}

// Sparkline data is shared across all visitors viewing the same player.
// 10min cache makes mover/grid pages effectively free after first warm.
// Cache key = cardIds[].sort() + days, so re-orders hit the same cache.
export const getPlayerSparklineByCardIds = unstable_cache(
  _getPlayerSparklineByCardIdsImpl,
  ["player-sparkline-by-ids"],
  { revalidate: 600 },
);

export async function getPlayerSparkline(
  slug: string,
  days: number = 30,
): Promise<{ ts: number; value: number }[]> {
  // Slug-based wrapper for the player detail page. Resolves slug -> cards
  // (which paginates the catalog) then delegates to the by-card-ids path.
  const player = await getPlayer(slug);
  if (!player || !player.cards.length) return [];
  return getPlayerSparklineByCardIds(player.cards.map((c) => c.id), days);
}

// Static editorial copy (was in mock; keeping as content the analyst writes)
export const PLAYER_BIOS: Record<string, string> = {
  "paul-skenes":
    "Pirates RHP. 2024 NL Rookie of the Year, sub-2 ERA over his debut season.",
  "mike-trout":
    "Angels CF. Eleven-time All-Star, three-time AL MVP, 2014 ALCS MVP.",
  "shohei-ohtani":
    "Dodgers DH/RHP. 2024 NL MVP. Two-way phenom; rewrote the playbook on player value.",
  "yoshinobu-yamamoto":
    "Dodgers RHP. Triple Sawamura winner in NPB. Anchored 2024 World Series rotation.",
  "jackson-holliday":
    "Orioles 2B/SS. #1 prospect in baseball; called up early in 2024.",
  "wyatt-langford":
    "Rangers OF. Top-3 draft pick in 2023, mashed his way through the system.",
  "junior-caminero":
    "Rays 3B. 2024 breakout; top-10 prospect ascending fast.",
  "gunnar-henderson":
    "Orioles SS. 2023 AL Rookie of the Year, 2024 All-Star.",
  "victor-wembanyama":
    "Spurs C. 2023 NBA #1 pick. 7'4\" with guard skills; rewriting expectations for the position.",
  "luka-doncic":
    "Mavericks PG. Five-time All-Star, four All-NBA First Team.",
  "lebron-james":
    "Lakers SF. Four-time NBA champion, four-time MVP, all-time leading scorer.",
  "stephen-curry":
    "Warriors PG. Four-time NBA champion, two-time MVP. Changed how basketball is played.",
};

export function getPlayerBio(slug: string): string {
  return PLAYER_BIOS[slug] ?? "";
}

export function getPlayerNews(playerName: string) {
  return NEWS.filter((n) =>
    n.headline.toLowerCase().includes(playerName.toLowerCase()),
  ).slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────
// Big trades + counts + portfolio
// ─────────────────────────────────────────────────────────────────────

async function _getBigTradesImpl(limit: number = 8): Promise<(Sale & { card: Card })[]> {
  const sb = supabase();
  // Top sales by price (PSA + BGS only to avoid raw fakes)
  const { data } = await sb
    .from("sales")
    .select(
      "id, card_id, sold_at, price_usd, is_graded, grader, grade_value, source, external_url, external_title, listing_type, image_url",
    )
    .eq("is_graded", true)
    .in("grader", ["PSA", "BGS"])
    .order("price_usd", { ascending: false })
    .limit(limit);
  const sales = (data || []).map(rowToSale);
  const cards = await getCardsByIds(sales.map((s) => s.card_id));
  return sales
    .map((s) => {
      const c = cards.get(s.card_id);
      return c ? { ...s, card: c } : null;
    })
    .filter((x): x is Sale & { card: Card } => x !== null);
}

// Top-N graded sales rarely change minute-to-minute. 5min cache.
export const getBigTrades = unstable_cache(_getBigTradesImpl, ["big-trades"], {
  revalidate: 300,
});

async function _getCountsImpl() {
  const sb = supabase();
  // count: "estimated" reads Postgres planner stats instead of doing a
  // full row scan. At ~1M+ sales rows the exact count timed out the
  // home-page edge function (was the dominant cause of / 502s). Estimated
  // is within a few percent and updates as autovacuum runs - perfect
  // for a "Cards tracked / Sales (5mo)" topline number.
  const [cards, sales, watch, releases] = await Promise.all([
    sb.from("card_identity").select("*", { count: "estimated", head: true }),
    sb.from("sales").select("*", { count: "estimated", head: true }),
    sb.from("watchlist").select("*", { count: "exact", head: true }),
    sb.from("releases").select("*", { count: "exact", head: true }),
  ]);
  return {
    cards: cards.count ?? 0,
    sales: sales.count ?? 0,
    watchlist: watch.count ?? 0,
    releases: releases.count ?? 0,
    sets: 0,
    trades: 0,
  };
}

// Counts barely move - 15min cache.
export const getCounts = unstable_cache(_getCountsImpl, ["home-counts"], {
  revalidate: 900,
});

export type Position = {
  card: Card;
  open_qty: number;
  avg_buy_usd: number;
  total_invested_usd: number;
  current_value_usd: number;
  unrealized_pl_usd: number;
  realized_pl_usd: number;
  hold_days: number;
};

export type PortfolioSummary = {
  total_invested_usd: number;
  total_current_value_usd: number;
  total_realized_pl_usd: number;
  total_unrealized_pl_usd: number;
};

export async function getPortfolio(): Promise<{
  positions: Position[];
  trades: never[];
  summary: PortfolioSummary;
}> {
  // No portfolio data in DB yet. Return an empty state.
  return {
    positions: [],
    trades: [],
    summary: {
      total_invested_usd: 0,
      total_current_value_usd: 0,
      total_realized_pl_usd: 0,
      total_unrealized_pl_usd: 0,
    },
  };
}

export async function getPortfolioValueLine(_days: number = 30): Promise<
  { ts: number; value: number }[]
> {
  // No portfolio data yet, no value line.
  return [];
}

// ─────────────────────────────────────────────────────────────────────
// Signal Engine - simplified to "high signal_score" picks. The full
// proprietary scoring will come back when we add a server-side job that
// writes scores to a column. For now: rank by sales_count_30d * abs(momentum)
// over cards with high confidence.
// ─────────────────────────────────────────────────────────────────────

export type GemFilters = {
  sport?: Sport | "all";
  priceBucket?: "<50" | "50-250" | "250-1k" | "1k+" | "all";
  confidence?: "any" | "low+" | "medium+" | "high";
};

/** Templated thesis text. Until we have analyst-written copy, generate a
 *  one-line read of what the data is saying. Keep it neutral, factual, no
 *  recommendations - Signal is a screener, not advice. */
function generateThesis(args: {
  momentum: number;
  samples: number;
  psa10: number | null;
  vwap30: number | null;
}): string {
  const { momentum, samples, psa10, vwap30 } = args;
  const pct = (momentum * 100).toFixed(1);
  const dir = momentum >= 0 ? "+" : "";
  const priceBit = psa10
    ? `PSA 10 averaging $${Math.round(psa10).toLocaleString()}`
    : vwap30
      ? `averaging $${Math.round(vwap30).toLocaleString()}`
      : null;

  // Strong move with volume → confident screen
  if (Math.abs(momentum) >= 0.15 && samples >= 30) {
    const verb = momentum > 0 ? "pushing above" : "settling below";
    return `${dir}${pct}% on ${samples} sales / 30d - ${verb} the 30-day baseline${
      priceBit ? `, ${priceBit}` : ""
    }. Sample density rules out a one-print spike.`;
  }

  // Strong move, thin volume → caveat
  if (Math.abs(momentum) >= 0.15) {
    return `${dir}${pct}% over 7d but only ${samples} sales / 30d. Real signal or one outlier transaction? Watch the next week of volume before committing.`;
  }

  // Modest move with volume → developing
  if (Math.abs(momentum) >= 0.05 && samples >= 20) {
    const dirWord = momentum > 0 ? "drift" : "softening";
    return `Early ${dirWord} (${dir}${pct}% over 7d) confirmed by ${samples} sales / 30d${
      priceBit ? `, ${priceBit}` : ""
    }. Worth tracking before the move accelerates.`;
  }

  // Default - high samples but quiet
  if (samples >= 30) {
    return `${samples} sales / 30d - high liquidity${
      priceBit ? `, ${priceBit}` : ""
    }. Currently flat (${dir}${pct}% over 7d); on the radar for any catalyst.`;
  }

  return `${samples} sales / 30d, ${dir}${pct}% over 7d${
    priceBit ? `, ${priceBit}` : ""
  }. Modest activity - needs more data before drawing a conclusion.`;
}

async function _getGemPicksImpl(_filters: GemFilters = {}): Promise<
  ((AnalyticsRow & { card: Card; signal: number }) & Record<string, any>)[]
> {
  const sb = supabase();
  const { data: rows } = await sb
    .from("analytics_daily")
    .select("*")
    .gt("sales_count_30d", 5)
    .not("momentum_score", "is", null)
    .order("sales_count_30d", { ascending: false })
    .limit(100);
  const ids = (rows || []).map((r) => r.card_id);
  const cards = await getCardsByIds(ids);
  const out: ((AnalyticsRow & { card: Card; signal: number }) & Record<string, any>)[] = [];
  for (const r of rows || []) {
    const card = cards.get(r.card_id);
    if (!card) continue;
    const mom = Number(r.momentum_score) || 0;
    const samples = Number(r.sales_count_30d) || 0;
    // Naive Signal: |momentum| × log(samples) - picks cards moving on real volume.
    // Caps so single outliers don't dominate.
    const signal = Math.min(
      100,
      Math.round(Math.abs(mom) * 100 + Math.log10(Math.max(1, samples)) * 20),
    );
    out.push({
      ...({
        card_id: r.card_id,
        snapshot_date: r.snapshot_date,
        vwap_7d_usd: r.vwap_7d_usd != null ? Number(r.vwap_7d_usd) : null,
        vwap_30d_usd: r.vwap_30d_usd != null ? Number(r.vwap_30d_usd) : null,
        vwap_90d_usd: r.vwap_90d_usd != null ? Number(r.vwap_90d_usd) : null,
        raw_vwap_30d_usd: r.raw_vwap_30d_usd != null ? Number(r.raw_vwap_30d_usd) : null,
        psa10_vwap_30d_usd: r.psa10_vwap_30d_usd != null ? Number(r.psa10_vwap_30d_usd) : null,
        psa9_vwap_90d_usd: null,
        bgs9_vwap_90d_usd: null,
        bgs95_vwap_90d_usd: null,
        bgs10_vwap_90d_usd: null,
        psa10_to_psa9_multiple: null,
        bgs95_to_bgs9_multiple: null,
        bgs10_to_bgs95_multiple: null,
        sales_count_30d: r.sales_count_30d != null ? Number(r.sales_count_30d) : null,
        velocity_score: r.velocity_score != null ? Number(r.velocity_score) : null,
        scarcity_score: null,
        gem_rate: null,
        momentum_score: mom,
        confidence:
          samples >= 30 ? "high" : samples >= 10 ? "medium" : samples >= 3 ? "low" : "insufficient",
        thesis: generateThesis({
          momentum: mom,
          samples,
          psa10: r.psa10_vwap_30d_usd != null ? Number(r.psa10_vwap_30d_usd) : null,
          vwap30: r.vwap_30d_usd != null ? Number(r.vwap_30d_usd) : null,
        }),
      } as AnalyticsRow),
      card,
      signal,
    });
  }
  return out.sort((a, b) => b.signal - a.signal);
}

// Gem picks (the home / Signal screener). 5min cache. Filter object is
// part of the cache key so /signal?sport=Baseball gets its own bucket.
export const getGemPicks = unstable_cache(_getGemPicksImpl, ["gem-picks"], {
  revalidate: 300,
});

// ─────────────────────────────────────────────────────────────────────
// Misc. compat exports
// ─────────────────────────────────────────────────────────────────────

export function lastRefresh(): Date {
  return new Date();
}

export async function getDashboardMovers(): Promise<{
  up: Player[];
  down: Player[];
}> {
  const players = await getPlayers();
  const ranked = players
    .filter((p) => p.momentum != null)
    .sort((a, b) => (b.momentum ?? 0) - (a.momentum ?? 0));
  return {
    up: ranked.slice(0, 5),
    down: [...ranked].reverse().slice(0, 5),
  };
}

// CARDS_BY_ID was used as a synchronous lookup in mock. With Supabase, callers
// should use getCardsByIds(). We export an empty map for back-compat in any
// place that still imports it; if you see its shape getting referenced, audit
// the call site.
export const CARDS_BY_ID: Record<string, Card> = {};

/** Pulls every card from the catalog. Used by header SearchBox so users can
 *  fuzzy-search the trader-relevant subset without a network round-trip per
 *  keystroke. Capped at the cards that actually have sales activity
 *  (joined via analytics_daily) — was 105K full catalog scan, which timed
 *  out the layout's edge function once 2019-2025 + 2016-2018 catalog landed.
 *  Long-tail cards are reachable via direct URL or the /players page. */
const SEARCH_INDEX_LIMIT = 8000;
export async function getAllCards(): Promise<Card[]> {
  const sb = supabase();
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  // Active-set first: join analytics_daily for cards with any 30d sales.
  const activeRows =
    (
      await sb
        .from("analytics_daily")
        .select("card_id")
        .gt("sales_count_30d", 0)
        .order("sales_count_30d", { ascending: false })
        .limit(SEARCH_INDEX_LIMIT)
    ).data || [];
  const activeIds = activeRows.map((r) => r.card_id);
  if (activeIds.length === 0) return [];
  const out: Card[] = [];
  for (let i = 0; i < activeIds.length; i += 200) {
    const chunk = activeIds.slice(i, i + 200);
    const { data } = await sb
      .from("card_identity")
      .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
      .in("id", chunk);
    out.push(...(data || []).map((r) => rowToCard(r, releases, sets)));
  }
  return out;
}

/** Back-compat: empty CARDS array. Real callers should use getAllCards(). */
export const CARDS: Card[] = [];

// Stub for code that still expects to iterate "all sales" - paginate from DB.
export async function allSales(): Promise<Sale[]> {
  const sb = supabase();
  const out: Sale[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("sales")
      .select(
        "id, card_id, sold_at, price_usd, is_graded, grader, grade_value, source, external_url, external_title, listing_type, image_url",
      )
      .order("sold_at", { ascending: false })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    out.push(...data.map(rowToSale));
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

// Static empty list for any remaining indices/etc. references.
export type IndexId = "football" | "baseball" | "basketball" | "rookies" | "vintage";
export type Index = { id: IndexId; name: string; cards: Card[] };
export async function getIndices(): Promise<Index[]> {
  return [];
}
export async function getIndex(_id: string): Promise<Index | null> {
  return null;
}
export async function getIndexLine(_id: string, _days: number = 30) {
  return [];
}
