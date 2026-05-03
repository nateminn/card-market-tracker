-- Migration 007 — capture authoritative parallel info on sales + active_listings.
--
-- Background: CardSight's /pricing and /marketplace responses include
-- `parallel_id` (uuid into parallel_types) and `parallel_name` (e.g.
-- "Silver Prizm", "Pink Refractor", "Mojo") on every record. We weren't
-- storing them, so the web layer had no way to tell a $1.25 base sale
-- from a $30 Mojo sale — they all live under the BASE card's UUID.
--
-- This adds the two columns to both transaction tables. Loaders write
-- them on every new row going forward. Existing rows get NULL until
-- re-pulled (the next pricing/listings refresh upserts the same external_id
-- and fills in the new fields).
--
-- We do NOT FK to parallel_types because:
--   1. Some parallel_ids in CardSight responses don't match anything in
--      our parallel_types table (we only loaded a subset).
--   2. parallel_types may grow over time; soft text + uuid is more
--      forgiving for a rolling-update workflow.
--
-- Idempotent.

alter table sales
  add column if not exists parallel_id uuid,
  add column if not exists parallel_name text;

alter table active_listings
  add column if not exists parallel_id uuid,
  add column if not exists parallel_name text;

-- Indexes — analytics will commonly filter "where parallel_id is null"
-- (i.e. base only) so make that fast.
create index if not exists sales_card_base_idx
  on sales (card_id) where parallel_id is null;

create index if not exists active_listings_card_base_idx
  on active_listings (card_id) where parallel_id is null;

create index if not exists sales_parallel_idx
  on sales (parallel_id) where parallel_id is not null;
