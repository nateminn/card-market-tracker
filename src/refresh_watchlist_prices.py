"""
refresh_watchlist_prices.py — pull CardSight pricing for every watchlist card,
upsert into the `sales` table. One CardSight call per watchlist card.

For each watchlist card:
- /pricing/{card_id} returns raw[] + graded[].grades[].records[]
- Each transaction becomes one `sales` row
- external_id = url || title|epoch  (loader-side, schema column isn't generated)
- Upsert with ignore_duplicates=True keyed on (card_id, external_id) — append-only

Usage:
    .venv/bin/python src/refresh_watchlist_prices.py             # interactive
    .venv/bin/python src/refresh_watchlist_prices.py --yes       # skip prompt
    .venv/bin/python src/refresh_watchlist_prices.py --limit 5   # only first N cards
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "exploration"))
sys.path.insert(0, str(ROOT / "src"))
from _client import call, call_count  # noqa: E402
from loader_run import LoaderRun  # noqa: E402

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
MONTHLY_BUDGET = 750


def make_external_id(record: dict) -> str:
    """Stable id for dedup across re-fetches. Convention from CLAUDE.md."""
    url = record.get("url")
    if url:
        return url
    title = record.get("title", "") or ""
    date_str = record.get("date") or ""
    try:
        ts = int(datetime.fromisoformat(date_str.replace("Z", "+00:00")).timestamp())
    except Exception:
        ts = 0
    return f"{title}|{ts}"


def record_to_row(card_id, rec, *, is_graded, grader=None, grade_value=None,
                  provenance: dict | None = None):
    row = {
        "card_id": card_id,
        "sold_at": rec["date"],
        "price_usd": rec["price"],
        "is_graded": is_graded,
        "grader": grader,
        "grade_value": grade_value,
        "listing_type": rec.get("listing_type"),
        "source": rec.get("source") or "ebay",
        "external_url": rec.get("url"),
        "external_title": rec.get("title"),
        "image_url": rec.get("image_url"),
        "raw_payload": rec,
        "external_id": make_external_id(rec),
    }
    if provenance:
        row.update(provenance)
    return row


def parse_pricing(card_id, body, provenance=None):
    rows = []
    raw_block = body.get("raw") or {}
    for rec in raw_block.get("records") or []:
        rows.append(record_to_row(card_id, rec, is_graded=False, provenance=provenance))
    for company in body.get("graded") or []:
        grader = company.get("company_name")
        for grade in company.get("grades") or []:
            gv = grade.get("grade_value")
            gv_str = str(gv) if gv is not None else None
            for rec in grade.get("records") or []:
                rows.append(record_to_row(
                    card_id, rec, is_graded=True, grader=grader,
                    grade_value=gv_str, provenance=provenance
                ))
    return rows


def count_for_card(card_id):
    res = client.table("sales").select("id", count="exact", head=True).eq("card_id", card_id).execute()
    return res.count or 0


def upsert_sales(rows):
    if not rows:
        return 0
    seen = {}
    for r in rows:
        seen[(r["card_id"], r["external_id"])] = r
    deduped = list(seen.values())
    for i in range(0, len(deduped), 500):
        client.table("sales").upsert(
            deduped[i:i + 500],
            on_conflict="card_id,external_id",
            ignore_duplicates=True,
        ).execute()
    return len(deduped)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", "-y", action="store_true", help="skip confirmation")
    ap.add_argument("--limit", type=int, default=None, help="only first N cards")
    args = ap.parse_args()

    watch = client.table("watchlist").select("card_id").order("added_at").execute().data or []
    if args.limit:
        watch = watch[:args.limit]
    if not watch:
        sys.exit("Watchlist is empty. Add cards via src/manage_watchlist.py first.")

    used = call_count()
    remaining = MONTHLY_BUDGET - used
    n_calls = len(watch)
    print(f"Watchlist: {n_calls} card(s) to refresh.")
    print(f"CardSight budget: {used} used / {MONTHLY_BUDGET} monthly ({remaining} remaining).")
    print(f"This refresh will use {n_calls} call(s) ({remaining - n_calls} would remain).")

    if not args.yes:
        ans = input("Continue? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            sys.exit("Cancelled.")

    with LoaderRun(
        "refresh_watchlist_prices.py",
        source="cardsight",
        params={"limit": args.limit, "watch_count": len(watch)},
    ) as run:
        provenance = run.stamp()

        total_processed = 0
        total_new = 0
        cards_404 = 0
        for w in watch:
            cid = w["card_id"]
            before = count_for_card(cid)
            status, body = call(f"/pricing/{cid}", save_as=None)
            run.add_api_calls(1)
            if status == 404:
                print(f"  {cid[:8]}.. -> 404 (no pricing for this card)")
                cards_404 += 1
                continue
            if status != 200:
                print(f"  {cid[:8]}.. -> {status} (skipped)")
                continue
            rows = parse_pricing(cid, body, provenance=provenance)
            run.add_rows_read(len(rows))
            upsert_sales(rows)
            after = count_for_card(cid)
            new = after - before
            total_new += new
            run.add_rows_written(new)
            total_processed += len(rows)
            print(f"  {cid[:8]}.. -> parsed {len(rows)} records ({new} new in DB)")
            time.sleep(0.3)

        print(f"\nDone.")
        print(f"  Cards refreshed: {len(watch) - cards_404}/{len(watch)}  (404s: {cards_404})")
        print(f"  Records processed: {total_processed}")
        print(f"  New rows in DB:    {total_new}")
        print(f"  CardSight calls used now: {call_count()}/{MONTHLY_BUDGET}")


if __name__ == "__main__":
    main()
