// Mock data fixture for the MVP.
//
// Real Supabase reads were swapped out so we can build / iterate the UX
// without depending on whether a card actually has sales in CardSight.
// The shapes here mirror lib/queries.ts; switching back to live data is a
// one-file change.
//
// Data is deterministic — a small linear congruential RNG seeded per card.
// Reload doesn't reshuffle anything.

export type Card = {
  id: string;
  player_name: string;
  card_number: string;
  is_rookie: boolean;
  release_year: string;
  release_name: string;
  set_name: string;
  sport: "Baseball" | "Basketball" | "Football";
  /** Median price tier we use as the centroid for generated sales. USD. */
  baseline_psa10: number;
  baseline_raw: number;
  /** How "on" the card is right now (drives sales density and momentum). */
  heat: "hot" | "warm" | "cold";
  /** Short trading symbol shown in tables and the right rail. Derived. */
  ticker: string;
  /** Real eBay thumbnail when available — populated by `src/seed_card_images.py`
   * via web/lib/card_images.json. Falls through to initials placeholder. */
  image_url?: string;
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
  /** eBay listing thumbnail when available — populated from CardSight per
   * sale in production. Mock falls back to the card's canonical image. */
  image_url?: string | null;
};

export type AnalyticsRow = {
  card_id: string;
  snapshot_date: string;
  vwap_7d_usd: number | null;
  vwap_30d_usd: number | null;
  vwap_90d_usd: number | null;
  raw_vwap_30d_usd: number | null;
  psa10_vwap_30d_usd: number | null;
  /** Per-grade VWAPs, 90-day window — used for grade-tier multiples. */
  psa9_vwap_90d_usd: number | null;
  bgs9_vwap_90d_usd: number | null;
  bgs95_vwap_90d_usd: number | null;
  bgs10_vwap_90d_usd: number | null;
  /** Multiples — PSA 10 / PSA 9, etc. null when either side is missing. */
  psa10_to_psa9_multiple: number | null;
  bgs95_to_bgs9_multiple: number | null;
  bgs10_to_bgs95_multiple: number | null;
  sales_count_30d: number | null;
  velocity_score: number | null;
  scarcity_score: number | null;
  gem_rate: number | null;
  momentum_score: number | null;
  /** UI-only: a one-line plain-English reason this card is interesting. */
  thesis?: string | null;
  confidence?: "high" | "medium" | "low" | "insufficient";
};

export type WatchlistEntry = {
  card_id: string;
  added_at: string;
  target_buy_usd: number | null;
  target_sell_usd: number | null;
  notes: string | null;
};

export type Trade = {
  id: number;
  card_id: string;
  side: "buy" | "sell";
  trade_date: string;
  quantity: number;
  price_usd: number;
  grader: string | null;
  grade_value: string | null;
  fees_usd: number;
  notes: string | null;
};

// ============================================================================
// Cards — 30 with varied identity, sport, set, baseline price, and heat
// ============================================================================

const PRODUCT_CODE: Record<string, string> = {
  "Topps Chrome": "TC",
  "Bowman Chrome": "BC",
  "Topps Update": "TU",
  "Panini Prizm": "PP",
  "Topps": "TPS",
};

function deriveTicker(c: Omit<Card, "ticker">): string {
  const parts = c.player_name.split(" ");
  const first = (parts[0]?.[0] ?? "").toUpperCase();
  const last = (parts[parts.length - 1] ?? "").slice(0, 3).toUpperCase();
  const code = PRODUCT_CODE[c.release_name] ?? c.release_name.slice(0, 2).toUpperCase();
  // 5 chars max so symbols stay tight in the right rail / tables.
  return `${first}${last}${code}`.slice(0, 5);
}

const _RAW_CARDS: Omit<Card, "ticker">[] = [
  // 2024 MLB rookies — Bowman Chrome / Topps Chrome
  { id: "skn-bc-bs",    player_name: "Paul Skenes",        card_number: "31",   is_rookie: true,  release_year: "2024",    release_name: "Bowman Chrome",   set_name: "Base Set", sport: "Baseball",  baseline_psa10: 145, baseline_raw: 14,  heat: "hot" },
  { id: "hol-bc-bs",    player_name: "Jackson Holliday",   card_number: "BCP-1",is_rookie: true,  release_year: "2024",    release_name: "Bowman Chrome",   set_name: "Prospects", sport: "Baseball",baseline_psa10: 92,  baseline_raw: 9,   heat: "warm" },
  { id: "lan-bc-bs",    player_name: "Wyatt Langford",     card_number: "104",  is_rookie: true,  release_year: "2024",    release_name: "Bowman Chrome",   set_name: "Base Set", sport: "Baseball",  baseline_psa10: 65,  baseline_raw: 7,   heat: "warm" },
  { id: "cam-bc-bs",    player_name: "Junior Caminero",    card_number: "56",   is_rookie: true,  release_year: "2024",    release_name: "Bowman Chrome",   set_name: "Base Set", sport: "Baseball",  baseline_psa10: 80,  baseline_raw: 8,   heat: "warm" },
  { id: "skn-tc-bs",    player_name: "Paul Skenes",        card_number: "152",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Baseball",  baseline_psa10: 110, baseline_raw: 12,  heat: "hot" },

  // Established MLB stars — older / mature pricing
  { id: "trt-tu-rc",    player_name: "Mike Trout",         card_number: "US175",is_rookie: true,  release_year: "2011",    release_name: "Topps Update",    set_name: "Base Set", sport: "Baseball",  baseline_psa10: 1850, baseline_raw: 130, heat: "warm" },
  { id: "oht-tu-rc",    player_name: "Shohei Ohtani",      card_number: "US285",is_rookie: true,  release_year: "2018",    release_name: "Topps Update",    set_name: "Base Set", sport: "Baseball",  baseline_psa10: 770,  baseline_raw: 70,  heat: "hot"  },
  { id: "hen-tc-rc",    player_name: "Gunnar Henderson",   card_number: "112",  is_rookie: true,  release_year: "2023",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Baseball",  baseline_psa10: 165,  baseline_raw: 18,  heat: "warm" },

  // 2024 NFL rookies — Topps Chrome / Panini Prizm
  { id: "cwm-tc-bs",    player_name: "Caleb Williams",     card_number: "202",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Football",  baseline_psa10: 95,  baseline_raw: 11,  heat: "warm" },
  { id: "jdl-tc-bs",    player_name: "Jayden Daniels",     card_number: "201",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Football",  baseline_psa10: 130, baseline_raw: 14,  heat: "hot"  },
  { id: "mhj-tc-bs",    player_name: "Marvin Harrison Jr", card_number: "203",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Football",  baseline_psa10: 105, baseline_raw: 12,  heat: "warm" },
  { id: "may-tc-bs",    player_name: "Drake Maye",         card_number: "210",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Football",  baseline_psa10: 60,  baseline_raw: 8,   heat: "cold" },
  { id: "bow-tc-bs",    player_name: "Brock Bowers",       card_number: "215",  is_rookie: true,  release_year: "2024",    release_name: "Topps Chrome",    set_name: "Base Set", sport: "Football",  baseline_psa10: 145, baseline_raw: 16,  heat: "hot"  },
  { id: "cwm-pp-bs",    player_name: "Caleb Williams",     card_number: "301",  is_rookie: true,  release_year: "2024",    release_name: "Panini Prizm",    set_name: "Base Set", sport: "Football",  baseline_psa10: 75,  baseline_raw: 9,   heat: "warm" },

  // Established NFL — Mahomes, Lamar
  { id: "mhm-pp-rc",    player_name: "Patrick Mahomes",    card_number: "248",  is_rookie: true,  release_year: "2017",    release_name: "Panini Prizm",    set_name: "Base Set", sport: "Football",  baseline_psa10: 320, baseline_raw: 38,  heat: "warm" },
  { id: "lmj-pp-rc",    player_name: "Lamar Jackson",      card_number: "313",  is_rookie: true,  release_year: "2018",    release_name: "Panini Prizm",    set_name: "Base Set", sport: "Football",  baseline_psa10: 195, baseline_raw: 22,  heat: "warm" },

  // 2023-24 NBA rookies — Prizm
  { id: "wem-pp-bs",    player_name: "Victor Wembanyama",  card_number: "297",  is_rookie: true,  release_year: "2023-24", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 285, baseline_raw: 32, heat: "hot"  },
  { id: "chh-pp-bs",    player_name: "Chet Holmgren",      card_number: "302",  is_rookie: true,  release_year: "2023-24", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 110, baseline_raw: 12, heat: "warm" },
  { id: "bmm-pp-bs",    player_name: "Brandon Miller",     card_number: "301",  is_rookie: true,  release_year: "2023-24", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 60,  baseline_raw: 7,  heat: "cold" },
  { id: "scc-pp-bs",    player_name: "Scoot Henderson",    card_number: "298",  is_rookie: true,  release_year: "2023-24", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 35,  baseline_raw: 5,  heat: "cold" },

  // Established NBA stars
  { id: "lbj-pp-rc",    player_name: "LeBron James",       card_number: "1",    is_rookie: true,  release_year: "2003-04", release_name: "Topps Chrome",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 1450, baseline_raw: 0, heat: "warm" },
  { id: "jok-pp-rc",    player_name: "Nikola Jokic",       card_number: "335",  is_rookie: true,  release_year: "2015-16", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 290,  baseline_raw: 0, heat: "warm" },
  { id: "luk-pp-rc",    player_name: "Luka Doncic",        card_number: "280",  is_rookie: true,  release_year: "2018-19", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 410,  baseline_raw: 0, heat: "warm" },
  { id: "jam-pp-rc",    player_name: "Ja Morant",          card_number: "249",  is_rookie: true,  release_year: "2019-20", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 175,  baseline_raw: 0, heat: "cold" },

  // Mid-tier / sparse-data cards (to show variety)
  { id: "rsk-tc-bs",    player_name: "Reed Sheppard",      card_number: "120",  is_rookie: true,  release_year: "2024-25", release_name: "Topps Chrome",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 28,  baseline_raw: 4,  heat: "cold" },
  { id: "ris-pp-bs",    player_name: "Zaccharie Risacher", card_number: "335",  is_rookie: true,  release_year: "2024-25", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 24,  baseline_raw: 3,  heat: "cold" },
  { id: "cas-bc-bs",    player_name: "Yoshinobu Yamamoto", card_number: "BCP-50", is_rookie: true, release_year: "2024",   release_name: "Bowman Chrome",   set_name: "Base Set", sport: "Baseball",  baseline_psa10: 70, baseline_raw: 8,  heat: "warm" },
  { id: "lar-tc-bs",    player_name: "Jared McCain",       card_number: "165",  is_rookie: true,  release_year: "2024-25", release_name: "Topps Chrome",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 32,  baseline_raw: 5,  heat: "warm" },
  { id: "cdr-tc-bs",    player_name: "Cade Cunningham",    card_number: "189",  is_rookie: true,  release_year: "2021-22", release_name: "Panini Prizm",    set_name: "Base Set", sport: "Basketball",baseline_psa10: 95,  baseline_raw: 11, heat: "warm" },

  // ---------------------------------------------------------------------
  // Variants — extra parallels for top players so player detail can show
  // the "totality of cards" experience: high-end /1, /5, /10 chase pieces
  // alongside the everyday base. These exercise the volume-weighted average
  // (a $20k SuperFractor with 1 sale shouldn't drown out 80 base sales).
  // ---------------------------------------------------------------------

  // Mike Trout — 2011 Topps Update Refractor family
  { id: "trt-tu-rfr",  player_name: "Mike Trout", card_number: "US175", is_rookie: true, release_year: "2011", release_name: "Topps Update", set_name: "Refractor",         sport: "Baseball", baseline_psa10:  3400, baseline_raw: 220, heat: "warm" },
  { id: "trt-tu-gld",  player_name: "Mike Trout", card_number: "US175", is_rookie: true, release_year: "2011", release_name: "Topps Update", set_name: "Gold Refractor /50", sport: "Baseball", baseline_psa10: 14000, baseline_raw: 0,   heat: "warm" },
  { id: "trt-tu-org",  player_name: "Mike Trout", card_number: "US175", is_rookie: true, release_year: "2011", release_name: "Topps Update", set_name: "Orange /25",         sport: "Baseball", baseline_psa10: 22000, baseline_raw: 0,   heat: "warm" },
  { id: "trt-tu-pnk",  player_name: "Mike Trout", card_number: "US175", is_rookie: true, release_year: "2011", release_name: "Topps Update", set_name: "Pink /199",          sport: "Baseball", baseline_psa10:  6500, baseline_raw: 0,   heat: "warm" },
  { id: "trt-tu-blk",  player_name: "Mike Trout", card_number: "US175", is_rookie: true, release_year: "2011", release_name: "Topps Update", set_name: "Black /1",           sport: "Baseball", baseline_psa10: 65000, baseline_raw: 0,   heat: "warm" },

  // Paul Skenes — 2024 Bowman Chrome Refractor family
  { id: "skn-bc-rfr",  player_name: "Paul Skenes", card_number: "31", is_rookie: true, release_year: "2024", release_name: "Bowman Chrome", set_name: "Refractor",          sport: "Baseball", baseline_psa10:  340, baseline_raw: 28,  heat: "hot" },
  { id: "skn-bc-gld",  player_name: "Paul Skenes", card_number: "31", is_rookie: true, release_year: "2024", release_name: "Bowman Chrome", set_name: "Gold Refractor /50",  sport: "Baseball", baseline_psa10: 2200, baseline_raw: 0,   heat: "hot" },
  { id: "skn-bc-org",  player_name: "Paul Skenes", card_number: "31", is_rookie: true, release_year: "2024", release_name: "Bowman Chrome", set_name: "Orange /25",          sport: "Baseball", baseline_psa10: 4500, baseline_raw: 0,   heat: "hot" },
  { id: "skn-bc-rd5",  player_name: "Paul Skenes", card_number: "31", is_rookie: true, release_year: "2024", release_name: "Bowman Chrome", set_name: "Red Refractor /5",    sport: "Baseball", baseline_psa10: 9500, baseline_raw: 0,   heat: "hot" },
  { id: "skn-bc-spf",  player_name: "Paul Skenes", card_number: "31", is_rookie: true, release_year: "2024", release_name: "Bowman Chrome", set_name: "SuperFractor 1/1",    sport: "Baseball", baseline_psa10: 32000, baseline_raw: 0,  heat: "hot" },

  // Shohei Ohtani — 2018 Topps Update parallels
  { id: "oht-tu-rfr",  player_name: "Shohei Ohtani", card_number: "US285", is_rookie: true, release_year: "2018", release_name: "Topps Update", set_name: "Refractor",          sport: "Baseball", baseline_psa10:  1750, baseline_raw: 165, heat: "hot" },
  { id: "oht-tu-gld",  player_name: "Shohei Ohtani", card_number: "US285", is_rookie: true, release_year: "2018", release_name: "Topps Update", set_name: "Gold Refractor /50", sport: "Baseball", baseline_psa10:  6800, baseline_raw: 0,   heat: "hot" },
  { id: "oht-tu-org",  player_name: "Shohei Ohtani", card_number: "US285", is_rookie: true, release_year: "2018", release_name: "Topps Update", set_name: "Orange /25",         sport: "Baseball", baseline_psa10: 11000, baseline_raw: 0,   heat: "hot" },
  { id: "oht-tu-rd5",  player_name: "Shohei Ohtani", card_number: "US285", is_rookie: true, release_year: "2018", release_name: "Topps Update", set_name: "Red Refractor /5",   sport: "Baseball", baseline_psa10: 24000, baseline_raw: 0,   heat: "hot" },

  // Wembanyama — 2023-24 Prizm parallels
  { id: "wem-pp-slv",  player_name: "Victor Wembanyama", card_number: "297", is_rookie: true, release_year: "2023-24", release_name: "Panini Prizm", set_name: "Silver Prizm",       sport: "Basketball", baseline_psa10:  720, baseline_raw: 80, heat: "hot" },
  { id: "wem-pp-grn",  player_name: "Victor Wembanyama", card_number: "297", is_rookie: true, release_year: "2023-24", release_name: "Panini Prizm", set_name: "Green Prizm",        sport: "Basketball", baseline_psa10: 1100, baseline_raw: 0,  heat: "hot" },
  { id: "wem-pp-mojo", player_name: "Victor Wembanyama", card_number: "297", is_rookie: true, release_year: "2023-24", release_name: "Panini Prizm", set_name: "Mojo /25",           sport: "Basketball", baseline_psa10: 4800, baseline_raw: 0,  heat: "hot" },
  { id: "wem-pp-glsh", player_name: "Victor Wembanyama", card_number: "297", is_rookie: true, release_year: "2023-24", release_name: "Panini Prizm", set_name: "Gold Shimmer /10",   sport: "Basketball", baseline_psa10:14000, baseline_raw: 0,  heat: "hot" },
  { id: "wem-pp-blk1", player_name: "Victor Wembanyama", card_number: "297", is_rookie: true, release_year: "2023-24", release_name: "Panini Prizm", set_name: "Black 1/1",          sport: "Basketball", baseline_psa10:42000, baseline_raw: 0,  heat: "hot" },

  // LeBron James — 2003-04 Topps Chrome parallels
  { id: "lbj-tc-rfr",  player_name: "LeBron James", card_number: "111", is_rookie: true, release_year: "2003-04", release_name: "Topps Chrome", set_name: "Refractor",            sport: "Basketball", baseline_psa10: 14500, baseline_raw: 0, heat: "warm" },
  { id: "lbj-tc-xfr",  player_name: "LeBron James", card_number: "111", is_rookie: true, release_year: "2003-04", release_name: "Topps Chrome", set_name: "X-Fractor /150",       sport: "Basketball", baseline_psa10: 27000, baseline_raw: 0, heat: "warm" },
  { id: "lbj-tc-blk",  player_name: "LeBron James", card_number: "111", is_rookie: true, release_year: "2003-04", release_name: "Topps Chrome", set_name: "Black Refractor /500", sport: "Basketball", baseline_psa10:  9500, baseline_raw: 0, heat: "warm" },

  // Patrick Mahomes — 2017 Prizm parallels
  { id: "mhm-pp-slv",  player_name: "Patrick Mahomes", card_number: "248", is_rookie: true, release_year: "2017", release_name: "Panini Prizm", set_name: "Silver Prizm",       sport: "Football", baseline_psa10: 1100, baseline_raw: 110, heat: "warm" },
  { id: "mhm-pp-rwb",  player_name: "Patrick Mahomes", card_number: "248", is_rookie: true, release_year: "2017", release_name: "Panini Prizm", set_name: "Red White Blue",     sport: "Football", baseline_psa10: 2400, baseline_raw: 0,   heat: "warm" },
  { id: "mhm-pp-gld",  player_name: "Patrick Mahomes", card_number: "248", is_rookie: true, release_year: "2017", release_name: "Panini Prizm", set_name: "Gold /10",           sport: "Football", baseline_psa10: 16000, baseline_raw: 0,  heat: "warm" },

  // Lamar Jackson — 2018 Prizm parallels
  { id: "lmj-pp-slv",  player_name: "Lamar Jackson", card_number: "313", is_rookie: true, release_year: "2018", release_name: "Panini Prizm", set_name: "Silver Prizm",       sport: "Football", baseline_psa10:  650, baseline_raw: 65, heat: "warm" },
  { id: "lmj-pp-grn",  player_name: "Lamar Jackson", card_number: "313", is_rookie: true, release_year: "2018", release_name: "Panini Prizm", set_name: "Green Prizm",        sport: "Football", baseline_psa10: 1200, baseline_raw: 0,  heat: "warm" },
  { id: "lmj-pp-rwb",  player_name: "Lamar Jackson", card_number: "313", is_rookie: true, release_year: "2018", release_name: "Panini Prizm", set_name: "Red White Blue",     sport: "Football", baseline_psa10: 1800, baseline_raw: 0,  heat: "warm" },

  // Luka Doncic — 2018-19 Prizm parallels
  { id: "luk-pp-slv",  player_name: "Luka Doncic", card_number: "280", is_rookie: true, release_year: "2018-19", release_name: "Panini Prizm", set_name: "Silver Prizm",   sport: "Basketball", baseline_psa10:  1300, baseline_raw: 0, heat: "warm" },
  { id: "luk-pp-grn",  player_name: "Luka Doncic", card_number: "280", is_rookie: true, release_year: "2018-19", release_name: "Panini Prizm", set_name: "Green Prizm",    sport: "Basketball", baseline_psa10:  2400, baseline_raw: 0, heat: "warm" },
  { id: "luk-pp-mojo", player_name: "Luka Doncic", card_number: "280", is_rookie: true, release_year: "2018-19", release_name: "Panini Prizm", set_name: "Mojo /25",       sport: "Basketball", baseline_psa10:  9800, baseline_raw: 0, heat: "warm" },

  // Jayden Daniels — 2024 Topps Chrome parallels
  { id: "jdl-tc-rfr",  player_name: "Jayden Daniels", card_number: "201", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Refractor",          sport: "Football", baseline_psa10: 320, baseline_raw: 36, heat: "hot" },
  { id: "jdl-tc-gld",  player_name: "Jayden Daniels", card_number: "201", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Gold Refractor /50", sport: "Football", baseline_psa10: 1900, baseline_raw: 0, heat: "hot" },
  { id: "jdl-tc-spf",  player_name: "Jayden Daniels", card_number: "201", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "SuperFractor 1/1",   sport: "Football", baseline_psa10:18000, baseline_raw: 0, heat: "hot" },

  // Caleb Williams — 2024 Topps Chrome parallels
  { id: "cwm-tc-rfr",  player_name: "Caleb Williams", card_number: "202", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Refractor",          sport: "Football", baseline_psa10: 250, baseline_raw: 28, heat: "warm" },
  { id: "cwm-tc-gld",  player_name: "Caleb Williams", card_number: "202", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Gold Refractor /50", sport: "Football", baseline_psa10: 1400, baseline_raw: 0, heat: "warm" },

  // Brock Bowers — 2024 Topps Chrome parallels
  { id: "bow-tc-rfr",  player_name: "Brock Bowers", card_number: "215", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Refractor",          sport: "Football", baseline_psa10: 380, baseline_raw: 42, heat: "hot" },
  { id: "bow-tc-gld",  player_name: "Brock Bowers", card_number: "215", is_rookie: true, release_year: "2024", release_name: "Topps Chrome", set_name: "Gold Refractor /50", sport: "Football", baseline_psa10: 2200, baseline_raw: 0, heat: "hot" },
];

// Real eBay thumbnails seeded from CardSight via src/seed_card_images.py.
// Keyed by player name; missing players fall through to initials placeholder.
import CARD_IMAGES from "./card_images.json";
const IMAGES_BY_PLAYER: Record<string, string> =
  (CARD_IMAGES as { by_player: Record<string, string> }).by_player ?? {};

export const CARDS: Card[] = _RAW_CARDS.map((c) => ({
  ...c,
  ticker: deriveTicker(c),
  image_url: IMAGES_BY_PLAYER[c.player_name],
}));

// Quick id-keyed lookup
export const CARDS_BY_ID: Record<string, Card> = Object.fromEntries(
  CARDS.map((c) => [c.id, c])
);

// ============================================================================
// Sales — generate per card with seeded random so reloads are stable
// ============================================================================

function lcg(seed: number) {
  // Linear congruential — Numerical Recipes constants
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function strSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const NOW = Date.UTC(2026, 3, 25); // 2026-04-25 — matches today
const FIVE_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 5;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Auction houses / marketplaces. Weighted: eBay dominates; high-value Trout
// vintage often hits Goldin / PWCC / Heritage.
const SOURCES = [
  { name: "eBay", weight: 0.75, label: "eBay" },
  { name: "Goldin", weight: 0.10, label: "Goldin" },
  { name: "PWCC", weight: 0.07, label: "PWCC" },
  { name: "Heritage", weight: 0.04, label: "Heritage" },
  { name: "Memory Lane", weight: 0.02, label: "Memory Lane" },
  { name: "MySlabs", weight: 0.02, label: "MySlabs" },
];

function pickSource(rng: () => number): string {
  const r = rng();
  let cumulative = 0;
  for (const s of SOURCES) {
    cumulative += s.weight;
    if (r <= cumulative) return s.label;
  }
  return "eBay";
}

// Global counter so sale ids are unique across cards. Combined views (player
// detail, index detail, big trades) use sale.id as React keys, so per-card
// counters would collide.
let _saleIdCounter = 0;

function genSalesFor(card: Card): Sale[] {
  const rng = lcg(strSeed(card.id));
  const heatMul = card.heat === "hot" ? 1.6 : card.heat === "warm" ? 1.0 : 0.45;
  // Older / pricier cards trade less frequently than current rookies
  const eraMul = Number(card.release_year.slice(0, 4)) < 2020 ? 0.4 : 1.0;
  const targetCount = Math.round(80 * heatMul * eraMul + rng() * 30);

  // Distribution per grade tier — graded raw mostly for active rookies,
  // older / pricier cards skew heavily toward graded sales
  const graded = Number(card.release_year.slice(0, 4)) < 2020 ? 0.85 : 0.55;
  const psa10Frac = 0.45;
  const psa9Frac  = 0.30;
  const psa8Frac  = 0.10;
  const otherGradedFrac = 0.15;

  const sales: Sale[] = [];
  for (let i = 0; i < targetCount; i++) {
    const isGraded = rng() < graded;
    let grader: string | null = null;
    let grade: string | null = null;
    let centroid = card.baseline_raw;
    if (isGraded) {
      const r = rng();
      // ~80% PSA, 15% BGS — bumped BGS share so the BGS 9.5/9 and 10/9.5
      // multiples on the card detail page actually have samples to compute.
      grader = r < 0.80 ? "PSA" : r < 0.95 ? "BGS" : r < 0.98 ? "SGC" : "Arena Club";
      const g = rng();
      if (grader === "BGS") {
        // BGS uses half-point grades. Population skews toward 9.5 (Gem Mint);
        // 10 (Pristine) is rare and commands a steep premium.
        if (g < 0.10) {
          grade = "10"; // Pristine: ~3.5x of 9.5 in real markets
          centroid = card.baseline_psa10 * 1.75;
        } else if (g < 0.55) {
          grade = "9.5"; // Gem Mint: roughly equal to PSA 10
          centroid = card.baseline_psa10 * 0.95;
        } else if (g < 0.85) {
          grade = "9"; // Mint: PSA 9 territory
          centroid = card.baseline_psa10 * 0.35;
        } else {
          grade = "8.5";
          centroid = card.baseline_psa10 * 0.18;
        }
      } else {
        // PSA / SGC / Arena Club use whole-point grading.
        if (g < psa10Frac) {
          grade = "10";
          centroid = card.baseline_psa10;
        } else if (g < psa10Frac + psa9Frac) {
          grade = "9";
          centroid = card.baseline_psa10 * 0.32;
        } else if (g < psa10Frac + psa9Frac + psa8Frac) {
          grade = "8";
          centroid = card.baseline_psa10 * 0.12;
        } else {
          grade = "7";
          centroid = card.baseline_psa10 * 0.06;
        }
      }
    }
    // Slight drift over time for hot cards
    const t = rng();
    const offsetMs = t * FIVE_MONTHS_MS;
    const sold_at = new Date(NOW - offsetMs).toISOString();
    const drift =
      card.heat === "hot"
        ? 1 + (1 - t) * 0.18 // recent sales 18% higher than 5mo ago
        : card.heat === "cold"
          ? 1 - (1 - t) * 0.12
          : 1 + (rng() - 0.5) * 0.05;
    const noise = 1 + (rng() - 0.5) * 0.18;
    const price = clamp(centroid * drift * noise, 0.5, centroid * 5);

    // Higher-priced (vintage / star) sales are more likely to come from
    // auction houses than eBay.
    const isHighValue = price > 800;
    const sourceForSale = isHighValue && rng() < 0.55 ? "Goldin" : pickSource(rng);

    // Mock external listing URL — when the data layer connects to real
    // eBay scraping, every sale will have a clickable affiliate URL. For
    // now we point at an eBay search for the card title so links are at
    // least navigable.
    const saleId = ++_saleIdCounter;
    const titleQuery = encodeURIComponent(
      `${card.release_year} ${card.release_name} ${card.player_name} ${grade ? `${grader} ${grade}` : "raw"}`
    );
    const url =
      sourceForSale === "eBay"
        ? `https://www.ebay.com/sch/i.html?_nkw=${titleQuery}`
        : sourceForSale === "Goldin"
          ? `https://goldin.co/search?q=${titleQuery}`
          : sourceForSale === "PWCC"
            ? `https://www.pwccmarketplace.com/search?q=${titleQuery}`
            : `https://www.google.com/search?q=${titleQuery}`;

    sales.push({
      id: saleId,
      card_id: card.id,
      sold_at,
      price_usd: Number(price.toFixed(2)),
      is_graded: isGraded,
      grader,
      grade_value: grade,
      source: sourceForSale,
      external_url: url,
      external_title: `${card.release_year} ${card.release_name} ${card.player_name} #${card.card_number}${grade ? ` ${grader} ${grade}` : ""}`,
      listing_type: rng() < 0.7 ? "fixed" : "auction",
      // Mock: every sale of a card uses the card's canonical eBay thumbnail.
      // Production CardSight gives each sale its own listing photo (different
      // sellers = different angles / lighting), but for our seeded data the
      // card-level image is the only one we have.
      image_url: card.image_url ?? null,
    });
  }
  return sales.sort(
    (a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime()
  );
}

let _salesCache: Sale[] | null = null;
export function allSales(): Sale[] {
  if (_salesCache) return _salesCache;
  _salesCache = CARDS.flatMap(genSalesFor);
  return _salesCache;
}

export function salesForCard(cardId: string): Sale[] {
  return allSales().filter((s) => s.card_id === cardId);
}

// ============================================================================
// Analytics — derived from sales, plus a hand-tuned thesis per featured card
// ============================================================================

function dateString(daysAgo: number) {
  const d = new Date(NOW - daysAgo * 86400 * 1000);
  return d.toISOString();
}

function meanPrice(sales: Sale[]) {
  if (!sales.length) return null;
  return Math.round(
    sales.reduce((a, s) => a + s.price_usd, 0) / sales.length
  );
}

function inWindow(sales: Sale[], days: number) {
  const cutoff = NOW - days * 86400 * 1000;
  return sales.filter((s) => new Date(s.sold_at).getTime() >= cutoff);
}

const SNAPSHOT = "2026-04-25";

const THESES: Record<string, { thesis: string; confidence: AnalyticsRow["confidence"] }> = {
  "skn-bc-bs":   { thesis: "PSA 10 trades up 23% on the 7-day; pop growth flat. Supply-constrained run.", confidence: "high" },
  "skn-tc-bs":   { thesis: "Topps Chrome lagging Bowman Chrome by 1.3x; historically converges within a quarter.", confidence: "high" },
  "wem-pp-bs":   { thesis: "Sales velocity halved month-over-month while PSA 10 VWAP holds. Coil before move.", confidence: "high" },
  "oht-tu-rc":   { thesis: "WS performance has put a floor in; 30d range tight, 7d up 9%.", confidence: "high" },
  "trt-tu-rc":   { thesis: "PSA 10 pop crossed 11k; ratio of 9-to-10s suggests crackouts incoming.", confidence: "medium" },
  "jdl-tc-bs":   { thesis: "Rookie season early returns lifting prints across Prizm + Chrome.", confidence: "medium" },
  "bow-tc-bs":   { thesis: "TE rookies historically peak 30 days post-Pro-Bowl; we're 14 out.", confidence: "medium" },
  "mhj-tc-bs":   { thesis: "Trading at 0.7x of peer rookies despite higher draft slot.", confidence: "medium" },
  "lmj-pp-rc":   { thesis: "MVP race noise lifting recent sales; durable signal unclear.", confidence: "low" },
  "mhm-pp-rc":   { thesis: "Sample sparse: three transactions in 30d, all at ask.", confidence: "low" },
  "ris-pp-bs":   { thesis: "First-overall pick under-trading peers; thin sample.", confidence: "insufficient" },
  "rsk-tc-bs":   { thesis: "Rookie of the Year narrative not yet priced; small market test.", confidence: "low" },
};

function computeAnalytics(card: Card): AnalyticsRow {
  const sales = salesForCard(card.id);
  const s7 = inWindow(sales, 7);
  const s30 = inWindow(sales, 30);
  const s90 = inWindow(sales, 90);
  const raw30 = s30.filter((x) => !x.is_graded);
  const psa10_30 = s30.filter(
    (x) => x.is_graded && x.grader === "PSA" && x.grade_value === "10"
  );

  // Per-grade VWAPs — 90d window (longer to find enough samples for less-traded grades).
  const psa9_90 = s90.filter(
    (x) => x.is_graded && x.grader === "PSA" && x.grade_value === "9"
  );
  const bgs9_90 = s90.filter(
    (x) => x.is_graded && x.grader === "BGS" && x.grade_value === "9"
  );
  const bgs95_90 = s90.filter(
    (x) => x.is_graded && x.grader === "BGS" && x.grade_value === "9.5"
  );
  const bgs10_90 = s90.filter(
    (x) => x.is_graded && x.grader === "BGS" && x.grade_value === "10"
  );

  const psa10_v90 = meanPrice(
    s90.filter((x) => x.is_graded && x.grader === "PSA" && x.grade_value === "10")
  );
  const psa9_v90 = meanPrice(psa9_90);
  const bgs9_v90 = meanPrice(bgs9_90);
  const bgs95_v90 = meanPrice(bgs95_90);
  const bgs10_v90 = meanPrice(bgs10_90);

  // Multiples — null when either side is missing or zero. Round to 2 decimals.
  const ratio = (top: number | null, bot: number | null) =>
    top != null && bot != null && bot > 0 ? Number((top / bot).toFixed(2)) : null;

  const v30 = meanPrice(s30);
  const v7 = meanPrice(s7);
  const momentum =
    v7 != null && v30 != null && v30 > 0
      ? Number(((v7 - v30) / v30).toFixed(4))
      : null;
  const velocity = s30.length ? Number((s30.length / 30).toFixed(2)) : null;

  // Scarcity / gem-rate are PSA-pop-derived; we don't have pop here so leave null
  // for most cards but invent a few for variety in the gem scanner.
  const tuned = THESES[card.id] ?? null;

  return {
    card_id: card.id,
    snapshot_date: SNAPSHOT,
    vwap_7d_usd: v7,
    vwap_30d_usd: v30,
    vwap_90d_usd: meanPrice(s90),
    raw_vwap_30d_usd: meanPrice(raw30),
    psa10_vwap_30d_usd: meanPrice(psa10_30),
    psa9_vwap_90d_usd: psa9_v90,
    bgs9_vwap_90d_usd: bgs9_v90,
    bgs95_vwap_90d_usd: bgs95_v90,
    bgs10_vwap_90d_usd: bgs10_v90,
    psa10_to_psa9_multiple: ratio(psa10_v90, psa9_v90),
    bgs95_to_bgs9_multiple: ratio(bgs95_v90, bgs9_v90),
    bgs10_to_bgs95_multiple: ratio(bgs10_v90, bgs95_v90),
    sales_count_30d: s30.length,
    velocity_score: velocity,
    scarcity_score: null,
    gem_rate: null,
    momentum_score: momentum,
    thesis: tuned?.thesis ?? null,
    confidence: tuned?.confidence ?? (s90.length >= 30 ? "high" : s90.length >= 10 ? "medium" : s90.length >= 3 ? "low" : "insufficient"),
  };
}

let _analyticsCache: Map<string, AnalyticsRow> | null = null;
export function getAllAnalytics(): AnalyticsRow[] {
  if (!_analyticsCache) {
    _analyticsCache = new Map(
      CARDS.map((c) => [c.id, computeAnalytics(c)])
    );
  }
  return Array.from(_analyticsCache.values());
}

export function getAnalytics(cardId: string): AnalyticsRow | null {
  if (!_analyticsCache) getAllAnalytics();
  return _analyticsCache!.get(cardId) ?? null;
}

// ============================================================================
// Watchlist (8 entries)
// ============================================================================

export const WATCHLIST: WatchlistEntry[] = [
  // Targets are tuned so a couple of mock entries surface "Buy"/"Sell" badges
  // — useful for showing the alerts feature working out of the box.
  { card_id: "skn-bc-bs", added_at: dateString(38), target_buy_usd: 130, target_sell_usd: 150, notes: "Hold for All-Star bump" },
  { card_id: "wem-pp-bs", added_at: dateString(54), target_buy_usd: 240, target_sell_usd: 400, notes: null },
  { card_id: "oht-tu-rc", added_at: dateString(20), target_buy_usd: 700, target_sell_usd: 950, notes: null },
  { card_id: "jdl-tc-bs", added_at: dateString(12), target_buy_usd: 160, target_sell_usd: 240, notes: null },
  { card_id: "bow-tc-bs", added_at: dateString(9),  target_buy_usd: 120, target_sell_usd: 200, notes: null },
  { card_id: "trt-tu-rc", added_at: dateString(80), target_buy_usd: 1700, target_sell_usd: 2400, notes: "Long-term hold" },
  { card_id: "hen-tc-rc", added_at: dateString(45), target_buy_usd: 130, target_sell_usd: 220, notes: null },
  { card_id: "mhj-tc-bs", added_at: dateString(7),  target_buy_usd: 120, target_sell_usd: 200, notes: "Cheap relative to peers" },
];

// ============================================================================
// Portfolio — eight trades (mix of buys and sells, some open positions)
// ============================================================================

export const TRADES: Trade[] = [
  { id: 1, card_id: "skn-bc-bs", side: "buy",  trade_date: dateString(95), quantity: 2, price_usd: 110, grader: "PSA", grade_value: "10", fees_usd: 0,    notes: "Live show pickup, slight discount" },
  { id: 2, card_id: "wem-pp-bs", side: "buy",  trade_date: dateString(120), quantity: 1, price_usd: 245, grader: "PSA", grade_value: "10", fees_usd: 0,    notes: null },
  { id: 3, card_id: "oht-tu-rc", side: "buy",  trade_date: dateString(180), quantity: 1, price_usd: 690, grader: "PSA", grade_value: "10", fees_usd: 0,    notes: null },
  { id: 4, card_id: "trt-tu-rc", side: "buy",  trade_date: dateString(260), quantity: 1, price_usd: 1620, grader: "PSA", grade_value: "10", fees_usd: 0,   notes: "Anchor position" },
  { id: 5, card_id: "skn-bc-bs", side: "sell", trade_date: dateString(20), quantity: 1, price_usd: 158, grader: "PSA", grade_value: "10", fees_usd: 18.6, notes: "Half off the table at +43%" },
  { id: 6, card_id: "jdl-tc-bs", side: "buy",  trade_date: dateString(40), quantity: 1, price_usd: 95,  grader: null,   grade_value: null, fees_usd: 0,    notes: "Raw, speculative" },
  { id: 7, card_id: "hen-tc-rc", side: "buy",  trade_date: dateString(70), quantity: 1, price_usd: 145, grader: "PSA", grade_value: "9",  fees_usd: 0,    notes: null },
  { id: 8, card_id: "bow-tc-bs", side: "buy",  trade_date: dateString(28), quantity: 2, price_usd: 122, grader: "PSA", grade_value: "10", fees_usd: 0,    notes: null },
];

// ============================================================================
// Counts (cheap)
// ============================================================================

export function getCounts() {
  return {
    cards: CARDS.length,
    watchlist: WATCHLIST.length,
    trades: TRADES.length,
    sales: allSales().length,
    sets: new Set(CARDS.map((c) => `${c.release_year}|${c.release_name}|${c.set_name}`)).size,
    releases: new Set(CARDS.map((c) => `${c.release_year}|${c.release_name}`)).size,
  };
}

// ============================================================================
// Sparkline points — daily VWAP for the last 30 days per card
// ============================================================================

let _sparkCache: Map<string, { ts: number; value: number }[]> | null = null;

/** Daily portfolio value (sum across open positions, weighted by qty).
 *  Used as the dashboard's main chart line. */
export function getPortfolioValueLine(days = 30): { ts: number; value: number }[] {
  // Aggregate open quantities per card from TRADES
  const openQty = new Map<string, number>();
  for (const t of TRADES) {
    const cur = openQty.get(t.card_id) ?? 0;
    openQty.set(t.card_id, cur + (t.side === "buy" ? t.quantity : -t.quantity));
  }
  // Build value series — for each day in window, sum (qty × VWAP that day)
  const dayMs = 86400 * 1000;
  const startDay = Math.floor((NOW - days * dayMs) / dayMs) * dayMs;
  const endDay = Math.floor(NOW / dayMs) * dayMs;
  const points: { ts: number; value: number }[] = [];
  for (let d = startDay; d <= endDay; d += dayMs) {
    let total = 0;
    for (const [cardId, qty] of openQty) {
      if (qty <= 0) continue;
      const spark = getSparkline(cardId, days);
      // Find the closest day at or before `d`
      let nearest: number | null = null;
      for (const p of spark) {
        if (p.ts <= d) nearest = p.value;
        else break;
      }
      if (nearest != null) total += qty * nearest;
    }
    if (total > 0) points.push({ ts: d, value: total });
  }
  return points;
}

export function getSparkline(
  cardId: string,
  days = 30
): { ts: number; value: number }[] {
  if (!_sparkCache) {
    _sparkCache = new Map();
    for (const c of CARDS) {
      const sales = salesForCard(c.id);
      const byDay = new Map<number, number[]>();
      const cutoff = NOW - days * 86400 * 1000;
      for (const s of sales) {
        const t = new Date(s.sold_at).getTime();
        if (t < cutoff) continue;
        const day = Math.floor(t / (86400 * 1000)) * 86400 * 1000;
        const list = byDay.get(day) ?? [];
        list.push(s.price_usd);
        byDay.set(day, list);
      }
      const points = Array.from(byDay.entries())
        .map(([ts, prices]) => ({
          ts,
          value: prices.reduce((a, b) => a + b, 0) / prices.length,
        }))
        .sort((a, b) => a.ts - b.ts);
      _sparkCache.set(c.id, points);
    }
  }
  return _sparkCache.get(cardId) ?? [];
}
