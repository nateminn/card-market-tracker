-- Migration 002 — loader_runs audit table.
--
-- Every loader script invocation gets a row here so we have a complete
-- provenance trail: which script wrote what, when, with what arguments,
-- whether it succeeded. Other data tables FK to this table via
-- loader_run_id (added in migration 003).
--
-- Idempotent.

create table if not exists loader_runs (
  id              uuid primary key default gen_random_uuid(),
  script_name     text not null,                            -- e.g. 'refresh_watchlist_prices.py'
  source_system   text,                                     -- 'cardsight', 'ebay', 'psa', 'manual'
  status          text not null default 'running',          -- 'running' | 'succeeded' | 'failed'
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  rows_written    int,
  rows_read       int,
  api_calls       int,                                      -- e.g. CardSight calls used
  params          jsonb,                                    -- args / config the script ran with
  error_message   text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists loader_runs_started_idx
  on loader_runs (started_at desc);
create index if not exists loader_runs_script_idx
  on loader_runs (script_name, started_at desc);
create index if not exists loader_runs_status_idx
  on loader_runs (status) where status != 'succeeded';
