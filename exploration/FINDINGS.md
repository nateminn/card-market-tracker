# CardSight API — Findings

Audit date: 2026-04-24. Base URL: `https://api.cardsight.ai/v1`. Auth: `X-API-Key` header.
Calls used during exploration: **57 of 750** monthly.

---

## TL;DR

CardSight gives us **the catalog and ~5 months of transaction-level eBay sales** —
enough to be the spine of Cardex. It does **not** give us PSA pop, deep historical
sales (>5mo), or any analytics layer. Bulk pricing doesn't exist. The OpenAPI spec
URL listed in the brief (`/v1/documentation/json`) is dead. Search relevance is
weak for variants and there are duplicate releases in the catalog.

**Verdict: proceed.** CardSight replaces TCDB taxonomy and most of PriceCharting,
partially replaces PSA APR, and leaves the analytics engine to us.

---

## Endpoints discovered (empirically — no live spec)

| Method | Path | Purpose |
|---|---|---|
| GET | `/catalog/segments` | List sports/categories (11 total) |
| GET | `/catalog/fields` | Custom field types (16 — mostly TCG) |
| GET | `/catalog/search` | Mixed search across cards/releases. params: `q`, `segment_id`, `take`, `skip` |
| GET | `/catalog/releases` | List releases. params: `segment_id`, `year`, `take` (max 100), `skip` |
| GET | `/catalog/releases/{id}` | Release metadata |
| GET | `/catalog/releases/{id}/cards` | All cards in a release (paginated) |
| GET | `/catalog/sets/{id}` | Set metadata |
| GET | `/catalog/sets/{id}/cards` | All cards in a set (paginated) |
| GET | `/catalog/cards?release_id=X` | Equivalent to releases/{id}/cards |
| GET | `/catalog/cards?set_id=X` | Equivalent to sets/{id}/cards |
| GET | `/catalog/cards/{id}` | Single card detail (incl. parallels list) |
| GET | `/pricing/{card_id}` | Sold sales, raw + graded, transaction-level |
| GET | `/marketplace/{card_id}` | Active listings, raw + graded |

**Confirmed NOT to exist** (returned 404 with auth):
`/pricing/bulk` (POST or GET), `/pricing` (without ID), `/health`, `/me`, `/account`,
`/cards/{id}` (without `/catalog/`), `/catalog/{id}/pricing`, `/v1/documentation/json`.

---

## DATA DEPTH

### Variant-level data
**Mixed.** Each parallel TYPE has its own UUID per set, but **the same UUID is shared across all base cards in that set** that have that parallel type. Confirmed empirically:
- The Green Refractor `7c65880d-...` UUID appears under 34 different base cards in 2024 Topps Chrome Football's "1974 Topps Football" set.
- `/catalog/cards/{base_id}` returns the same shared UUIDs in its `parallels` array as `/catalog/releases/{id}/cards` does for that base — they're parallel-TYPE UUIDs, not per-card-instance UUIDs.
- Each parallel UUID is scoped to exactly one set (verified across 235 unique parallels in 2024 Topps Chrome Football).

**`/pricing/{parallel_type_uuid}` returns 404.** Per-card parallel pricing is NOT available through CardSight — only base cards can be priced. Per-card parallel sales data has to come from eBay/PSA APR (Steps 7-8).

Cardex schema response: `card_identity` holds base cards only. Parallel types live in `parallel_types` (one row per set's parallel type). Per-(player, parallel) cards aren't materialized — they're derived via name composition for eBay search queries.

### Print runs
Present as `numberedTo` on parallels — **but only when populated**. Unnumbered parallels (e.g. "Fast Break", "Prizms Hyper", "Prizms Silver") have no field at all. We must treat absence as "unknown / not numbered" rather than missing data.

### Rookie status
**Encoded in `attributes` array on the card detail.** Trout had `["MLB-LAA", "RC"]` — `RC` = rookie card flag. Luka had `["NBA-DAL"]` (not a rookie record). This works but is implicit (string match on `RC`), not a typed field.

### Autograph / relic / serial-numbered
No explicit `isAutograph` / `isRelic` field anywhere. Inferable only from name strings (`"Autographs"`, `"Patch Auto"`) — fragile.

### Unique IDs for primary key
**Yes — UUID `id` field.** Every card, parallel, set, release, segment, manufacturer, grade, and grader has a UUID. Use these directly as PKs.

### Card images
**No images on card records.** Image URLs only appear on individual sale records inside `/pricing/{id}` responses (eBay listing thumbnails). For canonical card art we'd need another source.

### Catalog scale
- 11 segments (Baseball, Basketball, Football, Hockey, Soccer, Pokémon, MTG, Yu-Gi-Oh, One Piece, Wrestling, Entertainment).
- 4,236 baseball releases (use this as a proxy: each sport likely has thousands of releases).
- One major release like 2024 Topps Chrome contains ~984 cards (base + parallels combined).
- Total catalog size not exposed by any single endpoint, but the brief's "8M+ cards" is plausible.

---

## PRICING DEPTH

### Granularity
**Transaction-level (individual sales).** Each sale record:
```
title, price, date (ISO 8601 UTC), source, listing_type, url, image_url
```
Trout returned 480 sales total: 105 raw + 375 across graded categories.

### Marketplaces
**eBay only**, currently. `meta.sources` listed only `{source: "ebay", count: N}` for both pricing and marketplace responses. No StockX, COMC, PWCC, Goldin, etc.

### Historical depth
**~5 months. This is the biggest data limitation.**
Trout pricing oldest sale: `2025-11-26`, newest: `2026-04-24` (today).
This is a rolling window, not a deep archive. Any time-series analysis older
than ~5 months has to come from our own daily snapshots accumulated over time —
or from PSA APR / Card Ladder bought separately.

### Grade breakdown
**Yes, fully separated.** Graded sales are nested:
```
graded[].company_name        → "PSA" | "BGS" | "SGC"
graded[].company_id          → UUID
graded[].grades[].grade_value → "10" | "9.5" | ... | "Authentic"
graded[].grades[].grade_id    → UUID
graded[].grades[].count       → int
graded[].grades[].records[]   → individual sales
```
Trout returned PSA 1–10, BGS 1–10, SGC 1–10 plus Authentic categories.

### VWAP feasibility
**Yes** — we have price + date per transaction, can group by grade, compute volume-weighted averages over any window. But the source is single-marketplace (eBay) so it's eBay-VWAP, not market-wide.

### Active listings (`/marketplace/{id}`)
For popular cards: **real listings** with `title, price, source, listing_type, url, image_url, condition, end_date, bid_count`. Trout returned 49 active listings.

For obscure cards: **just an affiliate search-redirect URL**, no listing data. Luka Far Out! returned 1 record with only `{title, source, listing_type, url}` — that's a "go search this on eBay" link, not a listing. Don't trust marketplace data for thin-volume cards.

---

## WHAT CARDSIGHT REPLACES

| Source | Replacement status | Notes |
|---|---|---|
| **Fanter / TCDB** (taxonomy) | ✅ Fully replaced | Release/set/card/parallel hierarchy with stable UUIDs and inline parallel listings is exactly what those services provide. |
| **PriceCharting** (current valuations) | ⚠️ Partially replaced | We can compute current values from the rolling 5-month sales — but PriceCharting publishes longer historical comp graphs we won't match without our own snapshot history. |
| **PSA Auction Prices Realized** | ⚠️ Partially replaced | We get graded sales by grade — but only ~5 months. PSA APR has decade-deep auction history. We'll want APR for long-tail historical lookups. |

---

## WHAT WE STILL NEED

- **PSA pop reports** — confirmed not in CardSight. Need PSA's own data feed / scrape.
- **eBay active listings beyond the rolling window** — for obscure/low-volume cards CardSight returns an affiliate URL only. For watchlist items we may want our own eBay scrape.
- **Daily snapshot accumulation** — CardSight's pricing is rolling; long-term trends require us to persist daily aggregates.
- **The analytics engine** — VWAP, scarcity scores, gem rate, momentum, comps. CardSight doesn't compute any of these.
- **Card images** — canonical art for UI. CardSight only has eBay listing thumbnails.
- **Optional later**: Card Ladder for deeper historical comps; StockX/Goldin/PWCC for non-eBay marketplaces.

---

## GAPS / CONCERNS

1. **OpenAPI spec URL is dead.** `/v1/documentation/json` returns 404. We discovered endpoints empirically; future endpoint changes will be invisible to us.
2. **No bulk pricing.** Daily pricing for N cards = N API calls. This is the single biggest budget pressure.
3. **Duplicate releases.** Two records named "2024 Topps Chrome" (984 vs 972 cards), two "Sapphire Edition", etc. Catalog has dedup issues — we should treat (year, name) as a soft key and pick the larger record.
4. **Search relevance is weak.** `q="Mike Trout 2011 Topps Update"` returned only 1 result and missed every parallel. `q="Patrick Mahomes Prizm"` was dominated by 2025 Honors / Recollection Collection. Don't rely on `/catalog/search` for variant discovery — go via release → cards instead.
5. **Marketplace data is thin for obscure cards** (affiliate URL only).
6. **No `is_rookie`, `is_autograph`, `is_relic` typed fields.** Encoded as `RC` strings inside `attributes` or as set/parallel name substrings. Brittle.
7. **Sports `fields` are sparse.** Of the 16 custom fields, most are TCG-specific (HP, Pokédex Number, Weakness, Retreat Cost). Sports cards rely entirely on the structured `release/set/parallel/number` hierarchy + the ad-hoc `attributes` list.
8. **Soccer is `is_identifiable: false`.** Visual identification not supported for soccer (and most TCGs). Soccer catalog data exists but image-based lookup will not work.
9. **Single marketplace.** eBay-only pricing means our valuations will inherit eBay's biases.
10. **Auth via `X-API-Key` header confirmed working.** Returns 404 (not 401) on unauthenticated requests — masks errors during debugging.
11. **`segment_id` filter on `/catalog/releases` is ignored.** Calling with `?segment_id=<baseball>&year=2024` returns releases from football, basketball, and baseball mixed together. Don't trust this filter — must filter client-side on the returned `segmentId` field. Confirmed by pulling release `91e66c48-...` which appeared under a `segment_id=baseball` query but is actually football (`segmentId: 5b86ca75-...`).
12. **`/catalog/releases` `take` parameter has a max of 100.** `take=200` returns 400.

---

## API CALL BUDGET

| Activity | Calls |
|---|---|
| **Used during this exploration** | **57 / 750** |
| Pull 2024 Topps Chrome full set (984 cards, take=100) | 10 |
| Per-card pricing snapshot (one card) | 1 |
| Full pricing snapshot, one set of 984 cards | 984 |

### Realistic monthly budget shape

The 750/month free tier **cannot** support per-card daily pricing for any non-trivial portfolio.

- **Catalog ingest** is one-time bulk + occasional incremental — manageable.
- **Daily pricing pulls** must be scoped to a watchlist (e.g. 20–25 cards × 30 days = 600–750 calls/month, leaving zero headroom).
- For broader coverage we will need either (a) the paid tier, or (b) tiered refresh: hot cards daily, warm weekly, cold monthly.

**Recommendation:** treat the free tier as enough to validate the analytics pipeline on a small watchlist. Plan for paid before opening it up.

---

## SET-PULL DEMONSTRATION (Phase 4.12)

Pulled the full 2024 Topps Chrome Football release (release `91e66c48-...`) using `src/pull_set.py`. *Note: this turned out to be football not baseball — see concern #11 about the broken `segment_id` filter. The actual baseball release ID is `7cacca84-42c3-4f03-9771-46cdc19fd52e` (972 cards). To pull it instead: `python src/pull_set.py 7cacca84-42c3-4f03-9771-46cdc19fd52e`.*

| Metric | Value |
|---|---|
| API calls used to pull entire release | 11 (1 meta + 10 paginated card pages of 100) |
| Base cards | 984 |
| Parallels listed inline (across all base cards) | 17,697 |
| **Total unique catalog records (base + parallels)** | **18,681** |
| Sets in this release | 27 (Base Set, Autographs, Refractor lines, etc.) |
| Unique players | 317 |
| Rookie base cards (RC in attributes) | 100 |
| Parallels with explicit print run | 14,455 of 17,697 (~82%) |
| Top parallel types | SuperFractor (949), Red Refractor (889), Gold Refractor (874), Orange Refractor (874) |

**Key takeaway: catalog ingest is cheap.** ~11 calls to map 18,681 catalog records is excellent leverage. The expensive operation is per-card pricing (1 call each), not catalog enumeration.
