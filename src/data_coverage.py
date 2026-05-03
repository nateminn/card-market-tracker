"""Per-card data-coverage dashboard.

Answers: "for the cards I'm tracking, how rich is the data we have?"
Different from data_health.py (which is overall backend status). This is
about the depth of pricing per card.

Usage:
    python src/data_coverage.py                   # all watchlist cards
    python src/data_coverage.py --player "Trout"  # all cards for a player
    python src/data_coverage.py --top 30          # top 30 cards by sale count
    python src/data_coverage.py --no-data         # cards with zero sales
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def fetch_cards(*, watchlist: bool, player: str | None) -> list[dict]:
    """Resolve the set of cards to report on."""
    if watchlist:
        wl = sb.table("watchlist").select("card_id").execute().data or []
        ids = [w["card_id"] for w in wl]
        if not ids:
            return []
        out: list[dict] = []
        for i in range(0, len(ids), 200):
            r = (
                sb.table("card_identity")
                .select("id, player_name, card_number, set_id, release_id")
                .in_("id", ids[i : i + 200])
                .execute()
            )
            out.extend(r.data or [])
        return out
    if player:
        r = (
            sb.table("card_identity")
            .select("id, player_name, card_number, set_id, release_id")
            .ilike("player_name", f"%{player}%")
            .execute()
        )
        return r.data or []
    return []


def fetch_sales(card_ids: list[str]) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(card_ids), 100):
        chunk = card_ids[i : i + 100]
        offset = 0
        while True:
            r = (
                sb.table("sales")
                .select("card_id, sold_at, price_usd, grader, grade_value")
                .in_("card_id", chunk)
                .range(offset, offset + 999)
                .execute()
            )
            if not r.data:
                break
            out.extend(r.data)
            if len(r.data) < 1000:
                break
            offset += 1000
    return out


def lookup_releases_sets(cards: list[dict]) -> tuple[dict, dict]:
    set_ids = list({c["set_id"] for c in cards})
    rel_ids = list({c["release_id"] for c in cards})
    sets: dict[str, str] = {}
    for i in range(0, len(set_ids), 200):
        for s in (
            sb.table("sets")
            .select("id, name")
            .in_("id", set_ids[i : i + 200])
            .execute()
            .data
            or []
        ):
            sets[s["id"]] = s["name"]
    rels: dict[str, str] = {}
    for i in range(0, len(rel_ids), 200):
        for r in (
            sb.table("releases")
            .select("id, year, name")
            .in_("id", rel_ids[i : i + 200])
            .execute()
            .data
            or []
        ):
            rels[r["id"]] = f"{r['year']} {r['name']}"
    return sets, rels


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--player", help="show coverage for one player")
    ap.add_argument(
        "--no-data",
        action="store_true",
        help="show only cards with zero sales (the dark spots)",
    )
    ap.add_argument("--top", type=int, default=40, help="max rows to show")
    args = ap.parse_args()

    if args.player:
        cards = fetch_cards(watchlist=False, player=args.player)
        title = f"Coverage for player matching '{args.player}'"
    else:
        cards = fetch_cards(watchlist=True, player=None)
        title = "Coverage for all watchlist cards"

    if not cards:
        print("No cards match.")
        return 0

    sales = fetch_sales([c["id"] for c in cards])
    counts: dict[str, int] = defaultdict(int)
    psa10: dict[str, int] = defaultdict(int)
    prices: dict[str, list[float]] = defaultdict(list)
    newest: dict[str, datetime] = {}
    oldest: dict[str, datetime] = {}
    for s in sales:
        cid = s["card_id"]
        counts[cid] += 1
        prices[cid].append(float(s["price_usd"]))
        if s.get("grader") == "PSA" and s.get("grade_value") == "10":
            psa10[cid] += 1
        ts = datetime.fromisoformat(s["sold_at"].replace("Z", "+00:00"))
        if cid not in newest or ts > newest[cid]:
            newest[cid] = ts
        if cid not in oldest or ts < oldest[cid]:
            oldest[cid] = ts

    sets, rels = lookup_releases_sets(cards)

    enriched = []
    for c in cards:
        n = counts[c["id"]]
        if args.no_data and n != 0:
            continue
        if not args.no_data and n == 0:
            continue
        enriched.append(
            {
                "card": c,
                "n": n,
                "psa10": psa10[c["id"]],
                "avg": sum(prices[c["id"]]) / n if n else None,
                "newest": newest.get(c["id"]),
                "oldest": oldest.get(c["id"]),
            }
        )
    enriched.sort(key=lambda r: -r["n"])

    print()
    print("=" * 90)
    print(title)
    print("=" * 90)
    print(f"  {len(cards)} cards considered  ·  {sum(counts.values())} total sales")
    print()

    if args.no_data:
        print(f"  Cards with NO sales data ({len(enriched)}):\n")
        print(f"  {'PLAYER':<25s}  {'CARD #':<10s}  {'RELEASE / SET'}")
        for e in enriched[: args.top]:
            c = e["card"]
            rel_name = rels.get(c["release_id"], "?")
            set_name = sets.get(c["set_id"], "?")
            print(
                f"  {c['player_name']:<25s}  {(c.get('card_number') or '?'):<10s}  "
                f"{rel_name} · {set_name}"
            )
        if len(enriched) > args.top:
            print(f"  ... +{len(enriched) - args.top} more")
        return 0

    print(
        f"  {'PLAYER':<22s}  {'CARD #':<10s}  {'SALES':>5s}  {'PSA10':>5s}  "
        f"{'AVG':>9s}  {'OLDEST':>10s}  {'NEWEST':>10s}"
    )
    print("  " + "-" * 88)
    for e in enriched[: args.top]:
        c = e["card"]
        avg_s = f"${e['avg']:.2f}" if e["avg"] is not None else "—"
        oldest_s = e["oldest"].strftime("%Y-%m-%d") if e.get("oldest") else "—"
        newest_s = e["newest"].strftime("%Y-%m-%d") if e.get("newest") else "—"
        print(
            f"  {c['player_name'][:22]:<22s}  {(c.get('card_number') or '?'):<10s}  "
            f"{e['n']:>5,d}  {e['psa10']:>5,d}  {avg_s:>9s}  "
            f"{oldest_s:>10s}  {newest_s:>10s}"
        )
    if len(enriched) > args.top:
        print(f"  ... +{len(enriched) - args.top} more (use --top to expand)")

    # Coverage summary
    print()
    print("  Summary:")
    has_data = len([e for e in enriched if e["n"] > 0])
    print(
        f"    With data: {has_data}/{len(cards)} "
        f"({has_data / len(cards) * 100:.0f}%)"
    )
    if enriched:
        all_oldest = min(
            (e["oldest"] for e in enriched if e.get("oldest")), default=None
        )
        all_newest = max(
            (e["newest"] for e in enriched if e.get("newest")), default=None
        )
        if all_oldest and all_newest:
            print(
                f"    Date range: {all_oldest.strftime('%Y-%m-%d')} → "
                f"{all_newest.strftime('%Y-%m-%d')} "
                f"({(all_newest - all_oldest).days} days)"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
