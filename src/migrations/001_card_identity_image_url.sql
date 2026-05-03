-- Migration 001 — add canonical image_url to card_identity.
--
-- Why: CardSight returns thumbnails on every sale record (sales.image_url) but
-- not on the catalog. populate_card_images.py picks one image per card_id (most
-- recent eBay sale) and stashes it here so the UI / API doesn't have to join
-- the sales table just to render a card thumbnail.
--
-- Idempotent: safe to re-run.

alter table card_identity
  add column if not exists image_url     text,
  add column if not exists image_source  text,
  add column if not exists image_set_at  timestamptz;

create index if not exists card_identity_image_idx
  on card_identity (id) where image_url is not null;
