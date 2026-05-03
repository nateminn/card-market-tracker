-- Migration 003 — provenance fields on data tables.
--
-- Adds:
--   source_system text       — which external system / dataset the row
--                              came from (e.g. 'cardsight', 'ebay-browse',
--                              'psa-public-api', 'manual'). Lightweight enum.
--   loader_run_id uuid       — FK to loader_runs.id (nullable, set by the
--                              loader script that wrote / last touched
--                              the row). Lets us trace any row back to
--                              the exact run + script invocation.
--
-- Why both? source_system is a fast filter; loader_run_id is full-fidelity.
-- For rows older than this migration (anything already in the table) the
-- new columns stay null — that's fine, they pre-date provenance tracking.
--
-- Idempotent.

-- card_identity ------------------------------------------------------
alter table card_identity
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- parallel_types ------------------------------------------------------
alter table parallel_types
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- sets / releases / segments — catalog roots --------------------------
alter table sets
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);
alter table releases
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);
alter table segments
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- sales — already has `source` (sale source: ebay/auction-house) and
-- fetched_at; add source_system for the LOADER source ------------------
alter table sales
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- active_listings -----------------------------------------------------
alter table active_listings
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- analytics_daily — derived data, but the run that derived it is useful
alter table analytics_daily
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- population_snapshots ------------------------------------------------
alter table population_snapshots
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

-- Indexes — light-touch since these will only be queried during audits
create index if not exists card_identity_loader_run_idx
  on card_identity (loader_run_id) where loader_run_id is not null;
create index if not exists sales_loader_run_idx
  on sales (loader_run_id) where loader_run_id is not null;
