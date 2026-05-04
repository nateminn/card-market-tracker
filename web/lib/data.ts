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

async function loadReleaseLookup() {
  if (_memo.releases) return _memo.releases;
  const sb = supabase();
  const { data } = await sb.from("releases").select("id, year, name, segment_id");
  const map = new Map<string, { id: string; year: string; name: string; sport: Sport }>();
  for (const r of data || []) {
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
  const sb = supabase();
  const { data } = await sb.from("sets").select("id, name");
  const map = new Map<string, { id: string; name: string }>();
  for (const s of data || []) map.set(s.id, { id: s.id, name: s.name });
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
export async function getSparkline(
  cardId: string,
  days: number = 30,
): Promise<{ ts: number; value: number }[]> {
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
// Active listings (separate from sales - what's available to BUY right now)
// Populated by src/refresh_active_listings.py via CardSight /marketplace.
// ─────────────────────────────────────────────────────────────────────

export async function getActiveListings(cardId: string): Promise<ActiveListing[]> {
  const sb = supabase();
  const { data } = await sb
    .from("active_listings")
    .select(
      "id, card_id, observed_at, price_usd, listing_type, source, external_url, external_title, image_url, condition_raw, is_graded, grader, grade_value, end_date, bid_count, parallel_id, parallel_name",
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
export async function getPlayers(): Promise<Player[]> {
  const sb = supabase();
  // Find player names where at least one card has sales_count_30d > 0 in
  // analytics_daily - this is "currently active" players. Otherwise the list
  // would have 3,000+ names mostly with zero data.
  const { data: activeAnalytics } = await sb
    .from("analytics_daily")
    .select("card_id, sales_count_30d")
    .gt("sales_count_30d", 0)
    .order("sales_count_30d", { ascending: false })
    .limit(2000);
  const activeCardIds = (activeAnalytics || []).map((a) => a.card_id);
  if (activeCardIds.length === 0) return [];
  const cards = await getCardsByIds(activeCardIds);
  // Also pull analytics into a map for buildPlayer
  const analyticsByCard = new Map<string, AnalyticsRow>();
  for (let i = 0; i < activeCardIds.length; i += 200) {
    const chunk = activeCardIds.slice(i, i + 200);
    const { data } = await sb
      .from("analytics_daily")
      .select("*")
      .in("card_id", chunk);
    for (const a of data || []) {
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

export async function getPlayer(slug: string): Promise<Player | null> {
  const sb = supabase();
  // Find the canonical player_name for this slug
  const { data } = await sb
    .from("card_identity")
    .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
    .limit(2000); // cap; in practice we'll filter
  const players = new Map<string, any[]>();
  for (const r of data || []) {
    const s = playerSlug(r.player_name || "");
    if (!players.has(s)) players.set(s, []);
    players.get(s)!.push(r);
  }
  const matched = players.get(slug);
  if (!matched) {
    // Fallback: scan all cards (paginated) when the player wasn't in first 2000
    let offset = 2000;
    while (true) {
      const { data: more } = await sb
        .from("card_identity")
        .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
        .range(offset, offset + 999);
      if (!more || more.length === 0) break;
      for (const r of more) {
        if (playerSlug(r.player_name || "") === slug) {
          if (!players.has(slug)) players.set(slug, []);
          players.get(slug)!.push(r);
        }
      }
      if (more.length < 1000) break;
      offset += 1000;
    }
  }
  const rows = players.get(slug);
  if (!rows || rows.length === 0) return null;
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const cards = rows.map((r) => rowToCard(r, releases, sets));
  // Fetch analytics for these cards
  const analyticsByCard = new Map<string, AnalyticsRow>();
  const ids = cards.map((c) => c.id);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: aData } = await sb
      .from("analytics_daily")
      .select("*")
      .in("card_id", chunk);
    for (const a of aData || []) {
      analyticsByCard.set(a.card_id, (await getAnalytics(a.card_id)) as AnalyticsRow);
    }
  }
  return buildPlayer(rows[0].player_name, cards, analyticsByCard);
}

export async function getPlayerSales(slug: string): Promise<Sale[]> {
  const player = await getPlayer(slug);
  if (!player) return [];
  return fetchSalesForCards(player.cards.map((c) => c.id));
}

export async function getPlayerSparkline(
  slug: string,
  days: number = 30,
): Promise<{ ts: number; value: number }[]> {
  const sales = await getPlayerSales(slug);
  const cutoff = Date.now() - days * 86400 * 1000;
  const byDay = new Map<number, number[]>();
  for (const s of sales) {
    if (!s.is_graded || !s.grader || !ALLOWED_GRADERS.has(s.grader)) continue;
    if (s.grade_value !== "10") continue;
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

export async function getBigTrades(limit: number = 8): Promise<(Sale & { card: Card })[]> {
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

export async function getCounts() {
  const sb = supabase();
  const [cards, sales, watch, releases] = await Promise.all([
    sb.from("card_identity").select("*", { count: "exact", head: true }),
    sb.from("sales").select("*", { count: "exact", head: true }),
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

export async function getGemPicks(_filters: GemFilters = {}): Promise<
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
 *  fuzzy-search the entire catalog without a network round-trip per keystroke.
 *  Heavy - only call from server components that hold the result in memory. */
export async function getAllCards(): Promise<Card[]> {
  const sb = supabase();
  const [releases, sets] = await Promise.all([loadReleaseLookup(), loadSetLookup()]);
  const out: Card[] = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from("card_identity")
      .select("id, player_name, card_number, is_rookie, set_id, release_id, image_url")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    out.push(...data.map((r) => rowToCard(r, releases, sets)));
    if (data.length < 1000) break;
    offset += 1000;
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
