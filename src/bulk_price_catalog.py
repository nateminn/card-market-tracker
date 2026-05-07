"""Bulk-price the entire catalog using CardSight's bulk /pricing endpoint.

CardSight launched bulk pricing in their March 2026 release: POST /pricing
takes up to 100 card_ids and returns pricing for all of them in ONE call.
That changes the math completely — pricing a 10K-card catalog goes from
~10K calls (impossible on free tier) to ~100 calls (trivial).

Usage:
    python src/bulk_price_catalog.py --dry-run                # show plan
    python src/bulk_price_catalog.py --yes                    # full catalog
    python src/bulk_price_catalog.py --max-calls 50 --yes     # cap calls
    python src/bulk_price_catalog.py --player "Trout" --yes   # one player
    python src/bulk_price_catalog.py --release-id <uuid> --yes  # one release
    python src/bulk_price_catalog.py --no-data --yes          # only cards
                                                                with zero sales

Each call gets up to 100 cards' pricing. CardSight rate-limits at 1 call/sec
so the script paces itself.

Idempotent: sales upsert dedupes on (card_id, external_id).
Provenance: every new sale row carries loader_run_id + source_system.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "exploration"))
sys.path.insert(0, str(ROOT / "src"))
from _client import call_count  # noqa: E402  (file counter)
from loader_run import LoaderRun  # noqa: E402

KEY = os.environ["CARDSIGHT_API_KEY"]
BASE = "https://api.cardsight.ai/v1"
HEADERS = {
    "X-API-Key": KEY,
    "Accept": "application/json",
    "Content-Type": "application/json",
}
COUNTER = ROOT / "exploration" / "_call_count.txt"
MONTHLY_BUDGET = 5000  # CardSight Pro tier (was 750 on free)
BATCH_SIZE = 100  # CardSight's documented max

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def bump_counter() -> int:
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    n += 1
    COUNTER.write_text(str(n))
    return n


# ---------------------------------------------------------------------------
# Card-id selection
# ---------------------------------------------------------------------------


def select_card_ids(
    *,
    player: str | None,
    release_id: str | None,
    only_no_data: bool,
) -> list[str]:
    """Return the list of card_ids we should bulk-price."""
    # Pull all candidates first (paginated)
    cards: list[dict] = []
    offset = 0
    q = sb.table("card_identity").select("id, player_name, release_id")
    if player:
        q = q.ilike("player_name", f"%{player}%")
    if release_id:
        q = q.eq("release_id", release_id)
    while True:
        r = q.range(offset, offset + 999).execute()
        if not r.data:
            break
        cards.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000

    ids = [c["id"] for c in cards]
    if not only_no_data:
        return ids

    # Filter to cards with zero sales rows (paginate to avoid IN-list limits)
    have_sales: set[str] = set()
    for i in range(0, len(ids), 200):
        chunk = ids[i : i + 200]
        s = (
            sb.table("sales")
            .select("card_id")
            .in_("card_id", chunk)
            .limit(10_000)
            .execute()
        )
        for row in s.data or []:
            have_sales.add(row["card_id"])
    return [i for i in ids if i not in have_sales]


# ---------------------------------------------------------------------------
# Bulk pricing call
# ---------------------------------------------------------------------------


def bulk_pricing(card_ids: list[str]) -> dict:
    """One bulk pricing call (up to 100 ids). Returns the full response."""
    bump_counter()
    r = requests.post(
        f"{BASE}/pricing",
        headers=HEADERS,
        json={"card_ids": card_ids},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# Sale-row construction (mirrors refresh_priority_pricing.py)
# ---------------------------------------------------------------------------


def make_external_id(rec: dict) -> str:
    url = rec.get("url")
    if url:
        return url
    title = rec.get("title", "") or ""
    date_str = rec.get("date") or ""
    try:
        ts = int(datetime.fromisoformat(date_str.replace("Z", "+00:00")).timestamp())
    except Exception:
        ts = 0
    return f"{title}|{ts}"


def record_to_row(card_id: str, rec: dict, *, is_graded: bool, grader, grade_value, provenance: dict) -> dict:
    return {
        "card_id": card_id,
        "sold_at": rec.get("date"),
        "price_usd": rec.get("price"),
        "is_graded": is_graded,
        "grader": grader,
        "grade_value": grade_value,
        "listing_type": rec.get("listing_type"),
        "source": rec.get("source") or "ebay",
        "external_url": rec.get("url"),
        "external_title": rec.get("title"),
        "image_url": rec.get("image_url"),
        "parallel_id": rec.get("parallel_id"),
        "parallel_name": rec.get("parallel_name"),
        "raw_payload": rec,
        "external_id": make_external_id(rec),
        **provenance,
    }


def parse_pricing_block(card_id: str, body: dict, provenance: dict) -> list[dict]:
    rows: list[dict] = []
    raw_block = body.get("raw") or {}
    if isinstance(raw_block, dict):
        for rec in raw_block.get("records") or []:
            rows.append(record_to_row(card_id, rec, is_graded=False, grader=None, grade_value=None, provenance=provenance))
    for company in body.get("graded") or []:
        gname = company.get("company_name")
        for grade in company.get("grades") or []:
            gv = grade.get("grade_value")
            gv_str = str(gv) if gv is not None else None
            for rec in grade.get("records") or []:
                rows.append(record_to_row(card_id, rec, is_graded=True, grader=gname, grade_value=gv_str, provenance=provenance))
    return rows


def _upsert_chunk(rows: list[dict], retry_smaller: bool = True) -> int:
    """Upsert one chunk; on timeout, recursively split and retry.

    Catches BaseException so that even httpx.ReadTimeout (which doesn't
    subclass our usual try-target reliably across versions) gets handled.
    """
    if not rows:
        return 0
    try:
        sb.table("sales").upsert(
            rows, on_conflict="card_id,external_id", ignore_duplicates=True
        ).execute()
        return len(rows)
    except BaseException as exc:  # noqa: BLE001
        msg = str(exc).lower()
        type_name = type(exc).__name__
        if "sales_card_id_fkey" in str(exc):
            return 0
        is_timeout = (
            "timed out" in msg
            or "timeout" in msg
            or "ReadTimeout" in type_name
            or "ConnectTimeout" in type_name
        )
        if retry_smaller and is_timeout and len(rows) > 25:
            mid = len(rows) // 2
            return _upsert_chunk(rows[:mid], retry_smaller=True) + _upsert_chunk(rows[mid:], retry_smaller=True)
        print(f"    ⚠ upsert chunk of {len(rows)} failed ({type_name}); skipping")
        return 0


def upsert_sales(rows: list[dict]) -> int:
    if not rows:
        return 0
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[(r["card_id"], r["external_id"])] = r
    deduped = list(seen.values())
    written = 0
    # Chunk size 200 (was 500) — smaller chunks reduce the chance of a single
    # slow upsert hanging the run.
    for i in range(0, len(deduped), 200):
        written += _upsert_chunk(deduped[i : i + 200])
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, help="hard cap on bulk calls (each = 100 cards)")
    ap.add_argument("--player", help="only price cards matching this player name")
    ap.add_argument("--release-id", help="only price cards in this release")
    ap.add_argument("--no-data", action="store_true",
                    help="only price cards with zero sales rows yet")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true")
    args = ap.parse_args()

    print("Selecting cards to price...")
    ids = select_card_ids(
        player=args.player,
        release_id=args.release_id,
        only_no_data=args.no_data,
    )
    if not ids:
        print("Nothing matches. Exiting.")
        return 0

    batches = [ids[i : i + BATCH_SIZE] for i in range(0, len(ids), BATCH_SIZE)]
    if args.max_calls:
        batches = batches[: args.max_calls]
        ids = [c for b in batches for c in b]

    used = call_count()
    remaining = MONTHLY_BUDGET - used

    print(f"\nPlan: {len(ids):,} cards in {len(batches)} bulk calls")
    print(f"  CardSight budget: {used} / {MONTHLY_BUDGET}  ({remaining} remaining)")
    if len(batches) > remaining:
        print(f"  ✗ Plan needs {len(batches)} calls; only {remaining} left in monthly budget.")
        print(f"    Use --max-calls {remaining} or upgrade to Pro tier.")
        return 1

    if args.dry_run:
        print("\n  --dry-run: no calls made.")
        return 0

    if not args.yes:
        ans = input(f"\nContinue? Will use {len(batches)} CardSight calls. [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("Cancelled.")
            return 0

    with LoaderRun(
        "bulk_price_catalog.py",
        source="cardsight",
        params={
            "card_count": len(ids),
            "batches": len(batches),
            "filters": {
                "player": args.player,
                "release_id": args.release_id,
                "only_no_data": args.no_data,
            },
        },
        notes="Bulk-pricing pass via POST /pricing endpoint.",
    ) as run:
        provenance = run.stamp()
        total_records = 0
        total_written = 0
        cards_with_data = 0
        cards_no_data = 0
        for bi, batch in enumerate(batches, 1):
            print(f"\n  [{bi}/{len(batches)}] Pricing {len(batch)} cards...")
            try:
                resp = bulk_pricing(batch)
            except BaseException as exc:  # noqa: BLE001
                print(f"    ✗ Bulk call failed: {type(exc).__name__}; continuing")
                continue
            try:
                run.add_api_calls(1)
                results = resp.get("results", [])
                meta = resp.get("meta", {})
                print(
                    f"    requested={meta.get('requested', '?')}  "
                    f"successful={meta.get('successful', '?')}  "
                    f"failed={meta.get('failed', '?')}"
                )
                batch_rows: list[dict] = []
                for entry in results:
                    if not entry.get("success"):
                        continue
                    cid = entry["card_id"]
                    data = entry.get("data") or {}
                    rows = parse_pricing_block(cid, data, provenance)
                    if rows:
                        cards_with_data += 1
                        batch_rows.extend(rows)
                    else:
                        cards_no_data += 1
                # Upsert ONCE per batch (not per card) — cuts per-batch DB calls
                # by ~100x. Combined with the recursive retry inside upsert_sales,
                # this is much more resilient.
                if batch_rows:
                    written = upsert_sales(batch_rows)
                    total_records += len(batch_rows)
                    total_written += written
                run.add_rows_written(total_written)
            except BaseException as exc:  # noqa: BLE001
                print(f"    ⚠ Batch processing failed ({type(exc).__name__}); continuing")
            time.sleep(1.05)  # respect rate limit
        print(f"\nDone.")
        print(f"  Cards with data:   {cards_with_data:,}")
        print(f"  Cards no data:     {cards_no_data:,}")
        print(f"  Total records:     {total_records:,}")
        print(f"  Sales rows written:{total_written:,}")
        print(f"  CardSight calls:   {call_count()}/{MONTHLY_BUDGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
