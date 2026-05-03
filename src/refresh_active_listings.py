"""Pull current eBay active listings for a set of cards into active_listings.

Why this exists: the `sales` table is for COMPLETED sales (CardSight /pricing).
This loader populates the `active_listings` table from CardSight /marketplace
so the web app can show "what's available right now to buy" as a clearly
distinct section from "what's recently sold." Without this, the user just
sees sold sales and assumes (reasonably) that the eBay URL must be active —
because we have nothing else to label.

Cost: 1 CardSight call per card. Same monthly budget as pricing. Pick the
most-active cards first so listings are populated where users actually look.

Loader pattern:
  - For each target card, call GET /marketplace/{card_id}
  - DELETE existing active_listings rows for that card_id
  - INSERT fresh rows from raw + graded buckets
  - Wrap everything in a LoaderRun for audit

Why DELETE-then-INSERT: active listings are point-in-time. Yesterday's
listing may have ended or been relisted with a new URL. Wholesale replace
keeps the table accurate to the last refresh.

Usage:
    python src/refresh_active_listings.py --dry-run           # show plan
    python src/refresh_active_listings.py --yes               # default 50 cards
    python src/refresh_active_listings.py --max-cards 100 --yes
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
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

DEFAULT_MAX_CARDS = 50


# ---------------------------------------------------------------------------
# Candidate selection
# ---------------------------------------------------------------------------


def _candidates(limit: int) -> list[tuple[str, int, str | None]]:
    """Top cards by 30d sales count — these are the ones with active markets
    and where active listings will be useful. Returns [(card_id, sales_30d, label)]."""
    r = (
        client.table("analytics_daily")
        .select("card_id, sales_count_30d")
        .gt("sales_count_30d", 0)
        .order("sales_count_30d", desc=True)
        .limit(limit)
        .execute()
    )
    rows = r.data or []
    if not rows:
        return []
    ids = [r["card_id"] for r in rows]
    label_rows = (
        client.table("card_identity")
        .select("id, player_name, card_number")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    labels = {x["id"]: f"{x.get('player_name')} #{x.get('card_number')}" for x in label_rows}
    return [(r["card_id"], r["sales_count_30d"], labels.get(r["card_id"])) for r in rows]


# ---------------------------------------------------------------------------
# Marketplace parsing
# ---------------------------------------------------------------------------


_LISTING_KIND_MAP = {"auction": "auction", "fixed": "fixed", "best_offer": "best_offer"}


def _record_to_row(
    card_id: str,
    rec: dict,
    *,
    is_graded: bool,
    grader: str | None,
    grade_value: str | None,
    provenance: dict,
) -> dict:
    end_date = rec.get("end_date")
    return {
        "card_id": card_id,
        "price_usd": float(rec["price"]),
        "listing_type": _LISTING_KIND_MAP.get(
            (rec.get("listing_type") or "").lower(), "fixed"
        ),
        "source": rec.get("source") or "ebay",
        "external_url": rec.get("url"),
        "external_title": rec.get("title"),
        "image_url": rec.get("image_url"),
        "condition_raw": rec.get("condition"),
        "is_graded": is_graded,
        "grader": grader,
        "grade_value": grade_value,
        "end_date": end_date,
        "bid_count": rec.get("bid_count"),
        "parallel_id": rec.get("parallel_id"),
        "parallel_name": rec.get("parallel_name"),
        **provenance,
    }


def _parse_marketplace(card_id: str, body: dict, provenance: dict) -> list[dict]:
    """CardSight /marketplace returns the same { raw, graded } shape as /pricing,
    but each record has end_date / bid_count / condition because they're active."""
    rows: list[dict] = []
    payload = body.get("data") if "data" in body else body  # _client wraps in 'data'

    raw_block = payload.get("raw") or {}
    for rec in raw_block.get("records", []):
        if rec.get("price") is None:
            continue
        rows.append(_record_to_row(
            card_id, rec, is_graded=False, grader=None, grade_value=None, provenance=provenance
        ))

    for grader_block in payload.get("graded", []):
        grader_name = grader_block.get("company_name")
        for grade_block in grader_block.get("grades", []):
            gv = grade_block.get("grade_value")
            for rec in grade_block.get("records", []):
                if rec.get("price") is None:
                    continue
                rows.append(_record_to_row(
                    card_id,
                    rec,
                    is_graded=True,
                    grader=grader_name,
                    grade_value=str(gv) if gv is not None else None,
                    provenance=provenance,
                ))
    return rows


# ---------------------------------------------------------------------------
# Wholesale replace
# ---------------------------------------------------------------------------


def _replace_listings(card_id: str, rows: list[dict]) -> int:
    """DELETE existing rows for card, INSERT fresh batch. Returns rows written."""
    client.table("active_listings").delete().eq("card_id", card_id).execute()
    if not rows:
        return 0
    # Insert in chunks to stay under PostgREST limits
    written = 0
    for i in range(0, len(rows), 200):
        chunk = rows[i : i + 200]
        client.table("active_listings").insert(chunk).execute()
        written += len(chunk)
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-cards", type=int, default=DEFAULT_MAX_CARDS,
                    help=f"how many cards to refresh (default {DEFAULT_MAX_CARDS})")
    ap.add_argument("--dry-run", action="store_true", help="print plan, no API calls or writes")
    ap.add_argument("--yes", action="store_true", help="skip confirmation prompt")
    args = ap.parse_args()

    cards = _candidates(args.max_cards)
    print(f"Plan: refresh active_listings for {len(cards)} cards")
    print(f"  Each card = 1 CardSight call. Budget impact: {len(cards)} calls.")
    print(f"  Current monthly counter: {call_count()}/750 used")
    print()
    print("  Top 10 by 30d activity:")
    for cid, sales30, label in cards[:10]:
        print(f"    {label or cid[:8]:<40s}  sales_30d={sales30}")

    if args.dry_run:
        print("\nDry run; no calls made.")
        return 0

    if not args.yes:
        ans = input(f"\nProceed with {len(cards)} CardSight calls? [y/N] ")
        if ans.strip().lower() != "y":
            return 1

    with LoaderRun(
        "refresh_active_listings.py",
        source="cardsight",
        params={"max_cards": args.max_cards},
    ) as run:
        provenance = run.stamp()
        total_listings = 0
        for cid, sales30, label in cards:
            try:
                status, body = call(f"/marketplace/{cid}")
                run.add_api_calls(1)
            except Exception as e:
                print(f"  ! {label or cid[:8]}: API error: {e}")
                continue
            if status != 200:
                print(f"  ! {label or cid[:8]}: HTTP {status}")
                continue
            rows = _parse_marketplace(cid, body if isinstance(body, dict) else {"data": body}, provenance)
            written = _replace_listings(cid, rows)
            run.add_rows_written(written)
            run.add_rows_read(written)
            total_listings += written
            print(f"  ✓ {label or cid[:8]:<40s}  {written} listings")

        print(f"\nDone. {total_listings} active listings across {len(cards)} cards.")
        print(f"CardSight calls used in this run: {run.api_calls}")
        print(f"Monthly counter now: {call_count()}/750")
    return 0


if __name__ == "__main__":
    sys.exit(main())
