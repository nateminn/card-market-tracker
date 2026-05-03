"""Quick audit after a bulk pricing run — answer 'what just happened?'

Run this right after src/bulk_price_catalog.py finishes. It surfaces:
  - Total sales rows now vs. the change since the latest bulk run
  - Cards that gained sales (top by added rows)
  - Cards now with sales we didn't have before
  - Player-level coverage (top winners)
  - Estimated new image_url candidates (cards w/ ≥1 sale, no canonical image)

Usage:
    python src/post_bulk_audit.py             # latest bulk run
    python src/post_bulk_audit.py --run-id <uuid>
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", help="Audit this specific loader_runs id (default: latest bulk_price_catalog)")
    args = ap.parse_args()

    if args.run_id:
        run_id = args.run_id
    else:
        r = (
            sb.table("loader_runs")
            .select("id, started_at, status, rows_written, api_calls")
            .eq("script_name", "bulk_price_catalog.py")
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        if not r.data:
            print("No bulk_price_catalog runs found yet.")
            return 1
        run_id = r.data[0]["id"]
        print(f"Auditing latest run: {run_id} ({r.data[0]['status']})")

    # Pull all sales tagged with this run (paginate)
    rows: list[dict] = []
    offset = 0
    while True:
        r = (
            sb.table("sales")
            .select("id, card_id, sold_at, price_usd, grader, grade_value, image_url")
            .eq("loader_run_id", run_id)
            .range(offset, offset + 999)
            .execute()
        )
        if not r.data:
            break
        rows.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000

    if not rows:
        print(
            "No sales rows tagged with this run yet (might still be in flight, "
            "or the run completed but rows_written=0)."
        )
        return 0

    # Build per-card counts
    by_card = Counter(r["card_id"] for r in rows)
    card_ids = list(by_card.keys())

    # Lookup card metadata
    cards: dict[str, dict] = {}
    for i in range(0, len(card_ids), 200):
        chunk = card_ids[i : i + 200]
        for c in (
            sb.table("card_identity")
            .select("id, player_name, card_number, set_id, release_id, image_url")
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            cards[c["id"]] = c

    # ── Top cards by new sales ────────────────────────────
    print(f"\n=== Bulk run added {len(rows):,} sale rows across {len(by_card):,} cards ===\n")
    print("Top 20 cards by new sales rows:")
    print(f"  {'#':>4s}  {'PLAYER':<25s}  {'CARD #':<10s}  {'NEW':>6s}")
    print("  " + "-" * 60)
    for i, (cid, n) in enumerate(by_card.most_common(20), 1):
        c = cards.get(cid, {})
        print(
            f"  {i:>4d}  {c.get('player_name', '?')[:25]:<25s}  "
            f"{(c.get('card_number') or '?'):<10s}  {n:>6d}"
        )

    # ── Player-level winners ──────────────────────────────
    by_player: Counter = Counter()
    for cid, n in by_card.items():
        name = cards.get(cid, {}).get("player_name", "?")
        if name and "Variation" not in name and "Glass" not in name:
            by_player[name] += n
    print(f"\nTop 15 players by new sales rows:")
    for name, n in by_player.most_common(15):
        print(f"  {n:>6,d}  {name}")

    # ── Image coverage opportunity ────────────────────────
    cards_no_canonical = [
        cid for cid, n in by_card.items()
        if not cards.get(cid, {}).get("image_url") and n > 0
    ]
    sales_with_image = sum(1 for r in rows if r.get("image_url"))
    print(
        f"\n=== Image coverage opportunity ===\n"
        f"  Sales rows in this run with image_url: {sales_with_image:,}\n"
        f"  Cards that gained sales but lack canonical image: {len(cards_no_canonical):,}\n"
        f"  → Run `python src/populate_card_images.py` to backfill these."
    )

    # ── Sales summary ─────────────────────────────────────
    graded = sum(1 for r in rows if r.get("grader"))
    psa10 = sum(1 for r in rows if r.get("grader") == "PSA" and r.get("grade_value") == "10")
    avg = sum(float(r["price_usd"]) for r in rows if r.get("price_usd")) / len(rows) if rows else 0
    print(
        f"\n=== Sales summary ===\n"
        f"  Total: {len(rows):,}  |  Graded: {graded:,}  |  PSA 10: {psa10:,}\n"
        f"  Average price: ${avg:.2f}"
    )

    # ── Final database state ──────────────────────────────
    total = sb.table("sales").select("id", count="exact", head=True).execute().count
    print(f"\nTotal sales rows in DB now: {total:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
