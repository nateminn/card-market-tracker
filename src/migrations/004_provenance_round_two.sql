-- Migration 004 — provenance fields on the three tables 003 missed.
--
-- Migration 003 covered the catalog / sales / analytics core. This adds
-- the same `source_system` + `loader_run_id` audit columns to the
-- remaining tables that loaders touch:
--
--   manufacturers     — written by load_to_supabase.py (CardSight catalog)
--   price_snapshots   — currently empty; analytics_engine.py will write
--                       to it once we extend the engine to emit per-grade
--                       aggregates alongside analytics_daily
--   portfolio_trades  — dormant today (UI moved off trade-logging) but
--                       any future broker / verified-import loader will
--                       want provenance
--
-- We intentionally skip `watchlist` (user-created, not loader-fed) and
-- `_migrations` / `loader_runs` (they ARE the audit infrastructure).
-- `api_call_log` is left alone for now — it's a separate audit channel
-- and has its own `notes` field for free-form context.
--
-- Idempotent.

alter table manufacturers
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

alter table price_snapshots
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

alter table portfolio_trades
  add column if not exists source_system text,
  add column if not exists loader_run_id uuid references loader_runs(id);

create index if not exists portfolio_trades_loader_run_idx
  on portfolio_trades (loader_run_id) where loader_run_id is not null;
