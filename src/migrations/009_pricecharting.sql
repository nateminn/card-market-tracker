-- Migration 009 — PriceCharting historical pricing tables.
--
-- Optional integration. Tables sit empty until the user subscribes to
-- Legendary ($49/mo) and we run the bulk import. Idempotent.
--
-- pricecharting_products: one row per PriceCharting product, mapped to
-- our card_identity.id where we can match. The mapping is fuzzy (PC
-- doesn't share UUIDs with CardSight) — we match on (year, set, player,
-- card_number) heuristically.
--
-- pricecharting_history: per-product historical prices. PC tracks
-- "Loose", "CIB", "New", "Graded" buckets — for cards we mostly care
-- about Loose (raw) and Graded.

create table if not exists pricecharting_products (
  pc_product_id   bigint primary key,
  pc_console_id   int,
  card_id         uuid references card_identity(id),
  product_name    text,
  pc_set          text,
  pc_year         text,
  pc_player       text,
  pc_card_number  text,
  loose_price     numeric(12,2),
  cib_price       numeric(12,2),
  new_price       numeric(12,2),
  graded_price    numeric(12,2),
  manual_price    numeric(12,2),
  box_price       numeric(12,2),
  retail_loose    numeric(12,2),
  retail_cib      numeric(12,2),
  retail_new      numeric(12,2),
  fetched_at      timestamptz not null default now(),
  raw_payload     jsonb,
  source_system   text,
  loader_run_id   uuid references loader_runs(id)
);

create index if not exists pc_products_card_idx
  on pricecharting_products (card_id) where card_id is not null;

create index if not exists pc_products_player_idx
  on pricecharting_products (pc_player);

create table if not exists pricecharting_history (
  pc_product_id   bigint not null references pricecharting_products(pc_product_id),
  snapshot_date   date not null,
  loose_price     numeric(12,2),
  cib_price       numeric(12,2),
  new_price       numeric(12,2),
  graded_price    numeric(12,2),
  fetched_at      timestamptz not null default now(),
  source_system   text,
  loader_run_id   uuid references loader_runs(id),
  primary key (pc_product_id, snapshot_date)
);
