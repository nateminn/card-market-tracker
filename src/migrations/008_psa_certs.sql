-- Migration 008 - PSA cert lookups + spec mapping.
--
-- The PSA Public API exposes /cert/GetByCertNumber/<n>, returning per-cert
-- metadata: SpecID, year/brand/card_number/subject, Variety (the parallel),
-- TotalPopulation at that grade, and PopulationHigher (cards graded higher
-- than this one).
--
-- Strategy:
--   1. Harvest cert numbers from sales.external_title (PSA cert numbers
--      are 8-9 digit numerics that often appear in eBay listing titles).
--   2. For each unique cert, call the PSA API (via curl - Python requests
--      is Cloudflare-blocked, curl's TLS fingerprint passes).
--   3. Store the response in psa_certs.
--   4. Aggregate by spec_id to build per-card / per-parallel pop counts
--      that fill analytics_daily.scarcity_score (currently NULL on every
--      row) and gem_rate.
--
-- Free tier is 100 lookups/day. Selective lookups (top movers + watchlist)
-- give us pop data for the cards users actually look at, while we wait
-- for budget to scale.
--
-- We don't FK card_id to card_identity because not every PSA cert maps to
-- a card we have in our catalog (different sets, older years, etc.). The
-- match is best-effort, populated by a separate matching pass.
--
-- Idempotent.

create table if not exists psa_certs (
  cert_number       text primary key,
  spec_id           bigint,
  spec_number       text,
  -- PSA's identification of the card (raw strings from the API)
  psa_year          text,
  psa_brand         text,
  psa_category      text,
  psa_card_number   text,
  psa_subject       text,
  psa_variety       text,                 -- "GOLD REFRACTOR" etc - the parallel
  -- Grade info
  grade_description text,
  card_grade        text,                 -- "NM-MT 8", "GEM-MT 10" etc
  -- Pop counts AT THIS GRADE (not the full distribution)
  total_population  int,
  total_population_with_qualifier int,
  population_higher int,
  -- Optional link back to our catalog. Best-effort match, NULL if we
  -- can't identify which card_identity row this is.
  card_id           uuid references card_identity(id),
  -- Audit
  fetched_at        timestamptz not null default now(),
  raw_payload       jsonb,
  source_system     text,
  loader_run_id     uuid references loader_runs(id)
);

create index if not exists psa_certs_spec_idx
  on psa_certs (spec_id) where spec_id is not null;
create index if not exists psa_certs_card_idx
  on psa_certs (card_id) where card_id is not null;
create index if not exists psa_certs_subject_idx
  on psa_certs (psa_subject) where psa_subject is not null;

-- Materialised pop aggregates per (spec_id, grade). Built from psa_certs
-- as we accumulate lookups. Updated by the harvester or manually via:
--   refresh materialized view psa_pop_by_spec;
-- Keep as plain table for now (no concurrency or FK issues), populated
-- by the harvester after each batch.
create table if not exists psa_pop_by_spec (
  spec_id           bigint not null,
  grade             text not null,
  observed_pop      int not null,         -- TotalPopulation last seen
  observed_higher   int,                  -- PopulationHigher last seen
  cert_sample_count int not null,         -- how many certs we've looked up at this (spec, grade)
  last_updated      timestamptz not null default now(),
  primary key (spec_id, grade)
);
