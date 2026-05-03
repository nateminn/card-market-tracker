-- Cardex — Supabase / Postgres schema
-- Source attribution in comments next to each column.
-- CardSight UUIDs are reused directly as PKs where it makes sense to avoid an extra join layer.
-- All timestamps are timestamptz, all monetary values are numeric(12,2) USD.

-- =======================================================================
-- ENUMS
-- =======================================================================
-- NOTE: `grader` is intentionally plain text rather than an enum. Grading
-- companies keep emerging (Arena Club, ESPN+, etc.) and an enum forces
-- migrations every time CardSight returns a new one. Filter at query time.

create type listing_kind as enum ('auction', 'fixed', 'best_offer', 'search');
create type sale_source as enum ('ebay', 'pwcc', 'goldin', 'comc', 'stockx', 'fanatics', 'other');
create type trade_side as enum ('buy', 'sell');

-- =======================================================================
-- CATALOG (sourced from CardSight)
-- =======================================================================

-- Reference: sports / categories. CardSight: GET /catalog/segments
create table segments (
  id            uuid primary key,                       -- CardSight segments[].id
  name          text not null,                          -- "Baseball" | "Basketball" | ...
  is_identifiable boolean not null default false,       -- visual lookup supported
  created_at    timestamptz not null default now()
);

-- Reference: manufacturers (Topps, Panini, ...). Discovered indirectly via release.manufacturerId.
create table manufacturers (
  id   uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Reference: releases — e.g. "2024 Topps Chrome". CardSight: GET /catalog/releases
create table releases (
  id              uuid primary key,                     -- CardSight release.id
  segment_id      uuid not null references segments(id),
  manufacturer_id uuid references manufacturers(id),   -- nullable: not always populated
  year            text not null,                        -- text because CardSight uses "2019-20" for cross-season
  name            text not null,                        -- "Topps Chrome"
  is_identifiable boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index releases_segment_year_idx on releases (segment_id, year);
create index releases_name_idx on releases using gin (to_tsvector('english', name));

-- Reference: sets within a release (e.g. "Base Set", "Far Out!"). CardSight: GET /catalog/sets/{id}
create table sets (
  id          uuid primary key,                         -- CardSight set.id
  release_id  uuid not null references releases(id),
  name        text not null,                            -- "Base Set", "Far Out!", "Refractor", etc.
  is_identifiable boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index sets_release_idx on sets (release_id);

-- Cards. Base cards only. Parallels go in parallel_types — see note below.
-- CardSight inline `parallels` returns parallel-TYPE UUIDs (shared across base cards in a set).
-- /pricing/{parallel_type_uuid} returns 404, so per-card parallel pricing isn't available
-- through CardSight; per-card parallel sales come from eBay/PSA APR later (Steps 7-8).
-- The parent_card_id / parallel_name / numbered_to columns are kept nullable for forward
-- compat in case CardSight ever exposes per-instance parallel UUIDs.
-- CardSight: GET /catalog/cards/{id}
create table card_identity (
  id              uuid primary key,                     -- CardSight card.id (same UUID — no surrogate)
  set_id          uuid not null references sets(id),
  release_id      uuid not null references releases(id),  -- denormalised for query speed
  parent_card_id  uuid references card_identity(id),    -- null = base card; non-null = parallel of parent
  card_number     text,                                  -- "21", "BC25-1", "US175", etc.
  player_name     text not null,                         -- card.name
  parallel_name   text,                                  -- e.g. "Prizms Mojo", null for base
  numbered_to     int,                                   -- print run; null when unknown/unnumbered
  is_rookie       boolean not null default false,        -- derived: 'RC' in attributes[]
  is_autograph    boolean not null default false,        -- derived: name/set match heuristic
  is_relic        boolean not null default false,        -- derived: same
  attributes      jsonb,                                 -- raw attributes array from CardSight
  raw_payload     jsonb,                                 -- full original CardSight response (audit trail)
  image_url       text,                                  -- canonical thumbnail (lifted from sales.image_url)
  image_source    text,                                  -- 'sales' | 'marketplace' | 'manual' — where it came from
  image_set_at    timestamptz,                           -- when image_url was last picked
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  refreshed_at    timestamptz                            -- last time we re-pulled detail
);
create index card_identity_release_idx on card_identity (release_id);
create index card_identity_set_idx     on card_identity (set_id);
create index card_identity_parent_idx  on card_identity (parent_card_id);
create index card_identity_player_idx  on card_identity using gin (to_tsvector('english', player_name));
create index card_identity_rookie_idx  on card_identity (is_rookie) where is_rookie;

-- Parallel TYPES per set. The CardSight inline parallel UUID is a TYPE UUID (e.g. one
-- "Green Refractor /99" UUID per set; that UUID appears under every base card that has
-- a Green Refractor /99 in that set). Stored once per set. Verified that no parallel
-- UUID spans multiple sets in a release.
create table parallel_types (
  id              uuid primary key,                     -- CardSight parallel-type UUID
  set_id          uuid not null references sets(id),
  release_id      uuid not null references releases(id),  -- denormalized for query speed
  name            text not null,                          -- "Green Refractor", "SuperFractor"
  numbered_to     int,                                    -- print run; null when unnumbered/unknown
  is_autograph    boolean not null default false,         -- derived later from name heuristics
  is_relic        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index parallel_types_set_idx     on parallel_types (set_id);
create index parallel_types_release_idx on parallel_types (release_id);
create index parallel_types_name_idx    on parallel_types (name);

-- =======================================================================
-- PSA POPULATION (sourced from PSA — future)
-- =======================================================================

-- Snapshot of PSA pop counts for a card on a date. We'll write one row per (card, grade, date).
create table population_snapshots (
  card_id       uuid not null references card_identity(id),
  snapshot_date date not null,
  grader        text not null default 'PSA',
  grade_value   text not null,                          -- "10", "9", "Authentic", etc.
  population    int not null,                            -- count at that grade
  pop_higher    int,                                     -- count at higher grades (PSA's "higher" col)
  source_url    text,
  created_at    timestamptz not null default now(),
  primary key (card_id, snapshot_date, grader, grade_value)
);
create index population_snapshots_card_date_idx on population_snapshots (card_id, snapshot_date desc);

-- =======================================================================
-- SALES (sourced from CardSight pricing + PSA APR + manual)
-- =======================================================================

-- One row per individual transaction. Append-only.
-- CardSight: GET /pricing/{card_id} (raw[] + graded[].grades[].records[])
create table sales (
  id              bigserial primary key,
  card_id         uuid not null references card_identity(id),
  sold_at         timestamptz not null,                 -- record.date
  price_usd       numeric(12,2) not null,                -- record.price
  is_graded       boolean not null,                      -- raw vs graded
  grader          text,                                  -- nullable when raw
  grade_value     text,                                  -- "10", "9.5", "Authentic"
  listing_type    listing_kind,                          -- auction/fixed/best_offer
  source          sale_source not null,                  -- 'ebay' for now
  external_url    text,
  external_title  text,
  image_url       text,
  raw_payload     jsonb,                                 -- original record for audit
  fetched_at      timestamptz not null default now(),
  -- soft uniqueness key to dedupe across daily refreshes.
  -- Set by the loader (Python) — generated columns can't use timestamptz immutably.
  -- Convention: coalesce(external_url, external_title || '|' || str(int(sold_at.timestamp())))
  external_id     text not null,
  unique (card_id, external_id)
);
create index sales_card_date_idx on sales (card_id, sold_at desc);
create index sales_grade_idx     on sales (card_id, grader, grade_value, sold_at desc);

-- =======================================================================
-- ACTIVE LISTINGS (sourced from CardSight marketplace + eBay)
-- =======================================================================

-- Snapshot of currently-active listings per card per refresh.
-- Replaced wholesale on each refresh — we keep history via a separate archive if needed.
create table active_listings (
  id              bigserial primary key,
  card_id         uuid not null references card_identity(id),
  observed_at     timestamptz not null default now(),
  price_usd       numeric(12,2) not null,
  listing_type    listing_kind not null,
  source          sale_source not null,
  external_url    text,
  external_title  text,
  image_url       text,
  condition_raw   text,                                  -- eBay's free-text condition ("VERY_GOOD")
  is_graded       boolean not null,
  grader          text,
  grade_value     text,
  end_date        timestamptz,                            -- auctions only
  bid_count       int,
  raw_payload     jsonb
);
create index active_listings_card_obs_idx on active_listings (card_id, observed_at desc);

-- =======================================================================
-- DAILY PRICE SNAPSHOTS (calculated from sales)
-- =======================================================================

-- Per-card, per-grade daily roll-up. One row per (card, date, grade-bucket).
-- Computed nightly from the sales table for the prior 24h.
create table price_snapshots (
  card_id        uuid not null references card_identity(id),
  snapshot_date  date not null,
  grader         text,                                    -- null = raw
  grade_value    text,                                    -- null = raw
  sale_count     int not null,
  sum_price_usd  numeric(14,2) not null,
  vwap_usd       numeric(12,2) not null,                  -- sum_price / count (volume-weighted within day)
  min_price_usd  numeric(12,2) not null,
  max_price_usd  numeric(12,2) not null,
  median_usd     numeric(12,2),
  created_at     timestamptz not null default now(),
  primary key (card_id, snapshot_date, grader, grade_value)
);
create index price_snapshots_card_date_idx on price_snapshots (card_id, snapshot_date desc);

-- =======================================================================
-- ANALYTICS — derived metrics, calculated daily by us
-- =======================================================================

-- One row per (card, date). Houses VWAP-30d, velocity, scarcity, gem score, momentum.
create table analytics_daily (
  card_id           uuid not null references card_identity(id),
  snapshot_date     date not null,
  -- pricing aggregates
  vwap_7d_usd       numeric(12,2),                        -- 7-day rolling, all-grade weighted
  vwap_30d_usd      numeric(12,2),
  vwap_90d_usd      numeric(12,2),
  raw_vwap_30d_usd  numeric(12,2),
  psa10_vwap_30d_usd numeric(12,2),
  -- velocity
  sales_count_30d   int,
  active_listings_count int,
  velocity_score    numeric(6,3),                         -- normalized sales/day vs supply
  -- scarcity (derived from numbered_to + population)
  scarcity_score    numeric(6,3),                         -- higher = scarcer
  -- gem rate (PSA 10 / total PSA pop)
  gem_rate          numeric(6,4),
  -- momentum
  momentum_score    numeric(6,3),                         -- 7d vwap vs 30d vwap
  computed_at       timestamptz not null default now(),
  primary key (card_id, snapshot_date)
);
create index analytics_daily_date_idx on analytics_daily (snapshot_date);

-- =======================================================================
-- PORTFOLIO + WATCHLIST (manual user data)
-- =======================================================================

create table portfolio_trades (
  id            bigserial primary key,
  card_id       uuid not null references card_identity(id),
  side          trade_side not null,
  trade_date    date not null,
  quantity      int not null check (quantity > 0),
  price_usd     numeric(12,2) not null,
  grader        text,                                    -- null when raw
  grade_value   text,
  fees_usd      numeric(10,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);
create index portfolio_trades_card_idx on portfolio_trades (card_id, trade_date desc);

create table watchlist (
  id            bigserial primary key,
  card_id       uuid not null references card_identity(id),
  added_at      timestamptz not null default now(),
  target_buy_usd  numeric(12,2),
  target_sell_usd numeric(12,2),
  notes         text,
  unique (card_id)
);

-- =======================================================================
-- BUDGET / LOGGING (us, for the API call counter)
-- =======================================================================

create table api_call_log (
  id          bigserial primary key,
  called_at   timestamptz not null default now(),
  endpoint    text not null,
  status      int not null,
  elapsed_ms  int,
  notes       text
);
create index api_call_log_called_at_idx on api_call_log (called_at desc);

-- =======================================================================
-- FIELD MAPPING NOTES (CardSight → Cardex)
-- =======================================================================
-- segments[].id           → segments.id
-- segments[].name         → segments.name
-- segments[].is_identifiable → segments.is_identifiable
-- release.id              → releases.id
-- release.segmentId       → releases.segment_id
-- release.manufacturerId  → releases.manufacturer_id
-- release.year            → releases.year
-- release.name            → releases.name
-- set.id                  → sets.id
-- set.releaseId           → sets.release_id
-- set.name                → sets.name
-- card.id                 → card_identity.id
-- card.setId              → card_identity.set_id
-- card.releaseId          → card_identity.release_id
-- card.number             → card_identity.card_number
-- card.name               → card_identity.player_name
-- card.attributes         → card_identity.attributes (jsonb)  +  derived is_rookie if 'RC' in array
-- card.parallels[].id     → parallel_types.id (one row per set; same UUID is shared across base cards)
-- card.parallels[].name   → parallel_types.name
-- card.parallels[].numberedTo → parallel_types.numbered_to
-- (parallel_types.set_id   → first card.setId we see that parallel under)
-- pricing meta.last_sale_date → not stored (use max(sales.sold_at) instead)
-- pricing.raw[].records[]   → sales (is_graded=false)
-- pricing.graded[].grades[].records[] → sales (is_graded=true, grader=company_name, grade_value=grade_value)
-- marketplace.raw[].records[] / marketplace.graded[].grades[].records[] → active_listings
