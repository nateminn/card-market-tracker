# Cardex — orientation for future Claude sessions

If you're a fresh Claude session opening this project, **read this first**, then skim `exploration/FINDINGS.md` for the deep-dive on the data source.

## What Cardex is

Trading card market intelligence platform. Think Bloomberg Terminal for trading cards.
We pull catalog + pricing data from CardSight AI, layer our own analytics (VWAP, scarcity, gem score, momentum), and surface a portfolio + watchlist UI on top.

## Stack so far

- **Python 3.14** in `.venv/` (created with `python3 -m venv .venv`)
- **Dependencies:** requests, python-dotenv, pandas, supabase (see `requirements.txt`)
- **Data store:** Supabase / Postgres. Project `yzwzwucjoowkglnzfbnx` is live, all 12 tables created from `src/schema.sql`. Connection verified by `src/test_supabase.py`.

## Data sources

| Source | Status | What it gives us |
|---|---|---|
| **CardSight AI** | Live (free tier) | 11 sport segments, full catalog (releases / sets / cards / parallels with UUIDs), ~5 months of eBay sales by grade, current eBay listings |
| PSA pop reports | Not yet | Population by grade per card |
| eBay direct | Not yet | Active listings beyond CardSight's rolling window |
| PSA APR | Not yet | Deep historical auction data (>5 months back) |

## CardSight API — critical facts

- **Base URL:** `https://api.cardsight.ai/v1`
- **Auth:** `X-API-Key` header. Key in `.env` as `CARDSIGHT_API_KEY` (gitignored).
- **Free tier:** 750 calls / month. Track usage in `exploration/_call_count.txt` (currently 71).
- **The OpenAPI spec URL in their docs (`/v1/documentation/json`) is dead.** All endpoints below were discovered empirically.
- **The `segment_id` filter on `/catalog/releases` is silently ignored.** Filter client-side.
- **Bulk pricing endpoint EXISTS as of March/April 2026.** `POST /pricing` with body `{"card_ids": [uuid, uuid, ...]}` accepts up to 100 card_ids per call and returns a `{results: [{card_id, success, data: <same shape as single-card>}], meta: {requested, successful, failed}}` envelope. This collapses what used to be 1 call/card into 1 call/100 cards — pricing the entire 10K-card catalog is now ~107 calls instead of 10K. See `src/bulk_price_catalog.py`. The single-card `GET /pricing/{card_id}` endpoint is still there and is what the priority refresh script uses.
- **Pricing history is rolling ~5 months only.** Long-term trends require accumulating our own daily snapshots.
- **Marketplace data** is real eBay listings for popular cards but just an affiliate redirect URL for obscure cards.

### Working endpoints (use these — don't probe again)

| Endpoint | Purpose |
|---|---|
| `GET /catalog/segments` | 11 sports/categories |
| `GET /catalog/fields` | 16 custom fields (mostly TCG-specific) |
| `GET /catalog/search?q=&segment_id=&take=&skip=` | Mixed search — relevance is weak |
| `GET /catalog/releases?year=&take=` (max take=100) | Releases listing |
| `GET /catalog/releases/{id}` | Release metadata |
| `GET /catalog/releases/{id}/cards?take=&skip=` | All cards in a release (with parallels nested inline) |
| `GET /catalog/sets/{id}` | Set metadata |
| `GET /catalog/sets/{id}/cards?take=&skip=` | All cards in a set |
| `GET /catalog/cards/{id}` | Single card detail (incl. parallels list) |
| `GET /pricing/{card_id}` | Sold sales — raw + graded, transaction-level |
| `POST /pricing` body `{"card_ids":[...]}` (max 100) | **Bulk** sold sales — returns `{results: [{card_id, success, data}], meta}`. 1 call replaces up to 100 single-card calls. |
| `GET /marketplace/{card_id}` | Active eBay listings |
| `GET /release-calendar` | Upcoming + recent product releases (added April 2026) |

### Useful IDs to remember

- **Baseball segment:** `671e78da-64d2-45a4-8082-6682b2ae0e19`
- **Basketball segment:** `ac331a5c-ee1e-43fb-a10c-e59d249be7b7`
- **Football segment:** `5b86ca75-c5be-4621-aca1-57bd4f6dd111`
- **Trout 2011 Topps Update base (RC):** `fda530ab-e925-460e-ab88-63199ef975e9`

### Releases loaded into Supabase

All `data/release_<id>.json` are loaded into `card_identity` + `parallel_types`.
Catalog: 19,640 base cards, 3,117 parallel types (as of May 2026).

**2024 set (original load):**

| Release | UUID | Base | Parallel types |
|---|---|---:|---:|
| 2024 Topps Chrome Football | `91e66c48-701c-4565-953c-14e91d8f5030` | 984 | 235 |
| 2024 Topps Chrome Baseball | `7cacca84-42c3-4f03-9771-46cdc19fd52e` | 972 | 175 |
| 2023-24 Panini Prizm Basketball | `3395b970-2cb3-41ba-9eec-6512d4bb1720` | 925 | 167 |
| 2024 Bowman Chrome Baseball | `f73c58f7-5a21-4c02-a062-79ee72523d87` | 723 | 141 |
| 2024 Topps Baseball (=Series 1) | `a77e19c1-4b49-49dc-844d-543a058bf9a1` | 3,270 | 273 |
| 2024 Panini Prizm Football | `9d723d19-bc1f-4e38-ae24-f8347fddd16d` | 988 | 197 |

**2025 expansion (May 2026 load):**

| Release | UUID | Sport |
|---|---|---|
| 2025 Topps Baseball (Series 1) | `a18f2bcf-42b8-4c21-a9ca-89e5698f6922` | Baseball |
| 2025 Bowman Chrome | `44b28c60-60d1-44f7-b402-4efe73b1e006` | Baseball |
| 2025 Topps Chrome | `96a78024-3899-45c9-bf69-077d6d078dd9` | Baseball |
| 2025 Bowman | `010a1ac5-21b1-4661-9b37-d1bd86aa7df7` | Baseball |
| 2025 Panini Prizm Baseball | `fff811b8-c309-4ff2-bbca-67788a52addc` | Baseball |
| 2025 Panini Prizm Football | `83724bb2-b97c-4100-8e0b-f473b519085e` | Football |

The 2025 cards have catalog rows but most have no pricing yet — pricing
load was budget-blocked (local counter at 811/750; CardSight actual
budget reset May 1 but our local file accumulates). Either reset the
counter manually after confirming usage with CardSight, or upgrade to
Pro tier ($14.95/mo, lifts the cap to 5K+ calls/mo).

CardSight calls a flagship-baseball "Topps" with no Series 1/2 distinction; what hobby calls Topps Series 1 = CardSight's "Topps". "Topps Update" is its own separate release.

## Project layout

```
cardex/
├── .env                              # CARDSIGHT_API_KEY (gitignored)
├── .gitignore
├── CLAUDE.md                         # this file
├── README.md
├── requirements.txt
├── exploration/
│   ├── _client.py                    # CardSight helper (counts calls, saves responses)
│   ├── _call_count.txt               # rolling counter — DO NOT reset
│   ├── FINDINGS.md                   # the audit — READ THIS for deep details
│   ├── openapi_spec.json             # actually a 404 placeholder; spec endpoint is dead
│   ├── catalog_segments.json
│   ├── catalog_fields.json
│   ├── search_*.json                 # 4 named searches (Trout, Ohtani, Mahomes, Luka)
│   ├── card_detail.json              # Luka Doncic Far Out!
│   ├── card_detail_trout.json
│   ├── pricing_luka.json             # empty (obscure card)
│   ├── pricing_trout.json            # full — 480 sales across raw+graded
│   ├── marketplace_luka.json         # affiliate URL only
│   ├── marketplace_trout.json        # 49 real listings
│   ├── releases_baseball_2024.json
│   ├── releases_baseball_sample.json
│   ├── releases_topps_chrome_search.json
│   ├── set_cards_sample_farout.json
│   └── topps_chrome_2024_cards_sample.json
├── src/
│   ├── schema.sql                    # Supabase schema (executed against project yzwzwucjoowkglnzfbnx)
│   ├── migrate.py                    # migrations runner — applies src/migrations/NNN_*.sql, tracks via _migrations
│   ├── migrations/                   # numbered SQL migrations
│   │   ├── 001_card_identity_image_url.sql
│   │   ├── 002_loader_runs.sql
│   │   └── 003_provenance_fields.sql
│   ├── loader_run.py                 # LoaderRun context manager — every loader uses this for audit
│   ├── loader_status.py              # CLI: show recent loader_runs (--failed, --stuck, --show <id>)
│   ├── pull_set.py                   # paginated release puller (CardSight → JSON)
│   ├── load_to_supabase.py           # JSON → Supabase loader (segments, releases, sets, card_identity, parallel_types)
│   ├── manage_watchlist.py           # CLI: add / remove / list watchlist cards (searches card_identity)
│   ├── refresh_watchlist_prices.py   # CardSight pricing → sales table for every watchlist card
│   ├── seed_card_images.py           # Bulk-pulls /pricing for curated stars; emits web/lib/card_images.json
│   ├── populate_card_images.py       # Picks best sale image per card_id; updates card_identity.image_url
│   ├── analytics_engine.py           # sales → analytics_daily (VWAP, velocity, momentum); skips pop-dep metrics
│   └── test_supabase.py              # connection sanity check (insert→read→delete via FK chain)
├── data/
│   ├── release_91e66c48-...json      # full 2024 Topps Chrome Football pull (2.8MB)
│   └── release_91e66c48-..._summary.json
└── .venv/                            # virtualenv
```

## How to make API calls (the right way)

Always use the `_client.py` helper — it auto-counts calls and saves responses:

```python
import sys; sys.path.insert(0, 'exploration')
from _client import call, call_count

status, data = call('/catalog/cards/<uuid>', save_as='something.json')
print(f'Calls used: {call_count()}')
```

Don't make raw `requests.get()` calls in scripts — you'll lose the counter.

## Migrations

Schema changes live in `src/migrations/NNN_name.sql`. The runner tracks
applied migrations in a `_migrations` table.

```bash
python src/migrate.py status            # show applied / pending
python src/migrate.py up                # apply all pending
python src/migrate.py up 003_xxx        # apply one specific migration
python src/migrate.py mark 001_xxx      # record as applied without running
                                        #   (use after manual SQL-editor paste)
```

Requires `DATABASE_URL` in `.env` — get from Supabase Dashboard → Project
Settings → Database → Connection string (Session pooler, URI tab). Format:
`postgresql://postgres.PROJECT:PWD@HOST:5432/postgres`. Until that's set,
the runner prints how to find it.

**Convention:** every migration must be idempotent (`if not exists`,
`if exists`, `add column if not exists`, etc.). This lets `migrate.py up`
be safely re-run, and means migrations applied by hand in the SQL Editor
can be recorded via `migrate.py mark` afterward.

## Loader provenance & audit trail

Every script that writes to the database wraps its work in a `LoaderRun`
context manager (`src/loader_run.py`). This:

- Inserts a row into `loader_runs` at start (status='running')
- On normal exit: updates status='succeeded', sets `finished_at`,
  `rows_written`, `rows_read`, `api_calls`
- On exception: status='failed', captures the traceback in
  `error_message`, then re-raises
- Provides `run.stamp()` → a dict to merge into row inserts so each row
  records its `loader_run_id` and `source_system`

**Pattern:**
```python
from loader_run import LoaderRun

with LoaderRun("my_loader.py", source="cardsight",
               params={"foo": 1}) as run:
    provenance = run.stamp()  # {'loader_run_id': uuid, 'source_system': 'cardsight'}
    for thing in things:
        sb.table("sales").insert({**row, **provenance}).execute()
        run.add_rows_written(1)
        run.add_api_calls(1)
```

**Inspect runs:**
```bash
python src/loader_status.py                         # last 20
python src/loader_status.py --failed                # only failures
python src/loader_status.py --stuck                 # 'running' >1h
python src/loader_status.py --show <id-prefix>      # full detail of one run
```

`source_system` is a low-cardinality tag for "what kind of source produced
this row": `cardsight`, `ebay-browse`, `psa-public-api`, `derived` (for
analytics rows that are computed not pulled), `manual`. `loader_run_id` is
the high-fidelity FK back to `loader_runs.id` for audit.

## Schema design choices (see `src/schema.sql`)

- **CardSight UUIDs become our PKs directly** — no surrogate keys.
- **`card_identity` holds base cards only.** Per-card parallels (e.g. "Caleb Williams Green Refractor") are NOT materialized as rows because CardSight returns parallel-TYPE UUIDs that are shared across all base cards in a set, and `/pricing/<parallel_type>` returns 404. Per-card parallel sales come from eBay/PSA APR later.
- **`parallel_types` table** stores one row per parallel UUID per set (e.g. one "Green Refractor /99" row for the 1974 Topps Football set, not 34 rows for each player who has that parallel).
- The `card_identity` columns `parent_card_id`, `parallel_name`, `numbered_to` are kept for forward compat in case CardSight ever exposes per-instance parallel UUIDs — currently unused.
- **Sales are append-only**, deduped by `external_id` (plain text column — Postgres rejects `timestamptz` in generated-column expressions, so the loader must set it: `external_url or f"{title}|{int(sold_at.timestamp())}"`).
- **`active_listings` is replaced wholesale on each refresh.**
- **`analytics_daily` is the calculated layer** (VWAP, velocity, scarcity, gem rate, momentum).
- **Soft-derived flags** like `is_rookie` come from string-matching `RC` in the `attributes` array. CardSight doesn't expose typed booleans for rookie/auto/relic.

## Operating preferences

- **Save every API response as JSON** in `exploration/` or `data/` so the user can inspect.
- **Print clear summaries** after each test — call counts, record counts, key field discoveries.
- **Be efficient with calls** — 750/month free tier. The `_client.py` counter is the source of truth.
- **Never reset `exploration/_call_count.txt`** without the user asking.
- **Catalog ingest is cheap** (10 calls = whole release of 18k records). **Per-card pricing is expensive** (1 call/card). Prioritize accordingly.
- **The user works on macOS, Claude Desktop app**, and has bypassPermissions on globally.

## Known gotchas (don't relearn these the hard way)

1. CardSight's `segment_id` filter on `/catalog/releases` is ignored — must filter client-side.
2. Catalog has duplicate releases (e.g. two "2024 Topps Chrome" entries with different sports — football vs baseball).
3. Search relevance is poor. Don't trust `/catalog/search` for variant discovery; go via release → cards instead.
4. `numberedTo` only present when populated — absence ≠ no print run, just unknown.
5. Card images are NOT on card records, only on individual sale records (eBay thumbnails).
6. Soccer + most TCGs are `is_identifiable: false` (no visual lookup).
7. `take=200` returns 400 on `/catalog/releases`. Max is 100.
8. **Supabase RLS is ON by default** for tables created via the SQL Editor (newer projects). Backend Python uses the `sb_secret_...` key (in `SUPABASE_KEY`) to bypass RLS. The `sb_publishable_...` key would respect RLS and be denied. Never put the secret key in client-side code.
9. **Postgres generated columns cannot reference `timestamptz` immutably** — `extract(epoch from timestamptz)` is `STABLE`, not `IMMUTABLE`. The loader sets `sales.external_id` itself.
10. **`grader` is `text`, not an enum.** New grading companies keep emerging (Arena Club seen in real data; ESPN+ likely next). Filter known graders at query time.
11. **CardSight pricing is sparse for newly-released base cards.** Caleb Williams 2024 Topps Chrome base #202 and Jayden Daniels base #201 returned `count: 0` from `/pricing/{id}` — the index lags for current-year sports rookies. Older / more-traded cards (e.g. Paul Skenes 2024 Bowman Chrome RC: 413 sales) work fine. Don't assume `200` = "data present"; check `meta.total_records`.
12. **PSA bulk pop scraping is blocked.** Cloudflare blocks `requests`, `cloudscraper`, and even Apify's residential proxies on PSA's sports pop endpoints. ChrisMuir/psa-scrape (which used plain `requests`) is broken. PSA's free Public API works but needs spec IDs we can only get from cert lookups. Plan: accumulate spec IDs organically as cards are added to the watchlist (via cert numbers from eBay listings).
13. **Don't trust ilike-by-name UUID picks.** When discovering "the base RC" for a player via `card_identity.player_name ILIKE '%name%'`, you'll often hit insert/parallel UUIDs (e.g. `BC25-18` is a 1999 25th-anniversary insert, not the 2024 RC). Always verify: `parent_card_id IS NULL`, `release_id IS IN (loaded set)`, `is_rookie = true`, and ideally a numeric `card_number`. Audit step is in the `seed_card_images.py` SEEDS comments.
14. **`upsert` on `card_identity` requires NOT NULL fields** — supabase-py's upsert tries an INSERT path first, which fails for partial updates against tables with NOT NULL constraints (`set_id`, `release_id`, etc.). Use `.update().eq("id", x)` instead when amending existing catalog rows (e.g. `populate_card_images.py`).
15. **Per-sale image_urls vary; per-card canonical image is one of them.** `populate_card_images.py` picks the most-recent (then highest-priced) sale's image_url as the canonical one for `card_identity.image_url`. eBay listings rotate, so re-running this script over time will refresh the canonical image.

## What's next (per the build guide)

`Cardex_Build_Guide.docx` is in `~/Downloads/`. Steps 1–3 done. Step 4 (PSA bulk pop scraping) **deferred** — Cloudflare is blocking every approach we tried (`requests`, `cloudscraper`, raw Playwright, even Apify's `lulzasaur/psa-pop-scraper` actor with residential proxies fails on sports endpoints). Revisit when (a) bulk scraping becomes reliable, (b) the watchlist matures so we can use PSA's free Public API per-card via cert lookups, or (c) we accept a paid aggregator like PriceCharting Legendary which bundles pop data.

- **Step 6 (next): CardSight watchlist + pricing refresh.** Build `src/manage_watchlist.py` (add/remove/list, searches `card_identity` in Supabase) and `src/refresh_watchlist_prices.py` (calls CardSight `/pricing/{card_id}` for each watchlist entry, dedupes via `external_id`, inserts into `sales`). Free CardSight calls — only watchlist size × 1 per refresh.
- Step 5 (PriceCharting): paid £30/mo, defer until ready to sub.
- Step 7-8: PSA APR scrape + eBay Browse API.
- Step 9 done (analytics engine, `src/analytics_engine.py`). Currently computes VWAP / velocity / momentum / raw_vwap_30d / psa10_vwap_30d / confidence. Gracefully sets scarcity / gem_rate / active_listings to NULL until upstream data arrives.
- Step 10-12: dashboard + automation + paper trading.
- Step 5: PriceCharting daily snapshots (CSV download, paid).
- Step 6: CardSight pricing for the watchlist.
- Step 7: PSA APR historical sales scrape.
- Step 8: eBay Browse API for active listings.
- Step 9: Analytics engine (VWAP, scarcity, gem score).
- Step 10: Streamlit dashboard.
- Step 11: Daily cron pipeline.
- Step 12: Paper trading.
