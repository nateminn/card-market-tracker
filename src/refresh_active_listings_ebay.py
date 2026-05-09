"""Refresh active_listings table from eBay Browse API directly.

Why a second source (vs CardSight /marketplace):
  - eBay Browse is the actual source of truth (CardSight indexes eBay too)
  - 5,000 calls/day free vs CardSight's monthly cap
  - Direct affiliate link possible (revenue stream once eBay Partner Network
    is approved)
  - Better coverage on long-tail / non-flagship listings

Strategy per card:
  1. Build a search query from card_identity: player, year, release, set, #
  2. Browse search with category=Sports Trading Cards, buyingOptions filter
  3. Parse results into active_listings rows
  4. Wholesale-replace existing eBay-sourced rows for that card

Source labelling:
  - source_system='ebay-browse' for rows from this loader
  - distinct from CardSight's source_system='cardsight'

Usage:
    python src/refresh_active_listings_ebay.py --top 25 --dry-run
    python src/refresh_active_listings_ebay.py --top 25 --yes

Requires EBAY_CLIENT_ID + EBAY_CLIENT_SECRET in .env.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))

from ebay_client import search_items, call_count as ebay_call_count, DAILY_LIMIT  # noqa: E402
from loader_run import LoaderRun  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# eBay's Sports Trading Cards top-level category. Filter further via
# the q (keyword) string per card.
CATEGORY_SPORTS_TRADING_CARDS = "261328"


def _candidate_cards(limit: int) -> list[dict]:
    """Top cards by 30d sales activity, joined to identity for the search query."""
    ana = (
        sb.table("analytics_daily")
        .select("card_id, sales_count_30d")
        .gt("sales_count_30d", 0)
        .order("sales_count_30d", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    if not ana:
        return []
    ids = [r["card_id"] for r in ana]
    cards = (
        sb.table("card_identity")
        .select("id, player_name, card_number, set_id, release_id")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    by_id = {c["id"]: c for c in cards}
    # Join in release names for the search query
    rels = sb.table("releases").select("id, year, name").execute().data or []
    rel_by_id = {r["id"]: r for r in rels}
    sets_ = sb.table("sets").select("id, name").execute().data or []
    set_by_id = {s["id"]: s for s in sets_}

    out = []
    for r in ana:
        c = by_id.get(r["card_id"])
        if not c:
            continue
        rel = rel_by_id.get(c["release_id"]) or {}
        st = set_by_id.get(c["set_id"]) or {}
        out.append({
            "card_id": r["card_id"],
            "player_name": c["player_name"],
            "card_number": c.get("card_number") or "",
            "release_year": rel.get("year") or "",
            "release_name": rel.get("name") or "",
            "set_name": st.get("name") or "",
            "sales_30d": r["sales_count_30d"],
        })
    return out


def _build_query(card: dict) -> str:
    """eBay search keyword string. We pack identifying tokens to maximize
    relevance without overspecifying (eBay search does fuzzy match)."""
    bits = [
        card["release_year"],
        card["release_name"],
        card["set_name"],
        card["player_name"],
    ]
    if card["card_number"]:
        bits.append(f"#{card['card_number']}")
    return " ".join(b for b in bits if b)


def _record_to_row(card_id: str, item: dict, provenance: dict) -> dict:
    """Map an eBay item_summary record to our active_listings shape."""
    price = item.get("price") or {}
    price_usd = float(price.get("value") or 0)
    bo = (item.get("buyingOptions") or [])
    listing_type = "auction" if "AUCTION" in bo else "fixed"
    end = item.get("itemEndDate")
    title = item.get("title") or ""
    img = (item.get("image") or {}).get("imageUrl")
    cond = item.get("condition")
    # Detect graded - look for grading service + grade in title (heuristic)
    title_lc = title.lower()
    is_graded = any(g in title_lc for g in ("psa ", "bgs ", "sgc ", "cgc "))
    grader = None
    grade_value = None
    for g in ("psa", "bgs", "sgc", "cgc"):
        if f"{g} " in title_lc:
            grader = g.upper()
            # next token after grader name
            try:
                idx = title_lc.index(f"{g} ") + len(g) + 1
                grade_value = title[idx:idx + 4].split()[0]
            except Exception:
                pass
            break
    return {
        "card_id": card_id,
        "price_usd": price_usd,
        "listing_type": listing_type,
        "source": "ebay",
        "external_url": item.get("itemAffiliateWebUrl") or item.get("itemWebUrl"),
        "external_title": title,
        "image_url": img,
        "condition_raw": cond,
        "is_graded": is_graded,
        "grader": grader,
        "grade_value": grade_value,
        "end_date": end,
        "bid_count": item.get("bidCount"),
        **provenance,
    }


def _replace_ebay_listings(card_id: str, rows: list[dict]) -> int:
    """Replace eBay-sourced rows for this card_id only. CardSight rows are
    untouched (they live under source_system='cardsight')."""
    sb.table("active_listings").delete()\
        .eq("card_id", card_id)\
        .eq("source_system", "ebay-browse")\
        .execute()
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        sb.table("active_listings").insert(chunk).execute()
        written += len(chunk)
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=25, help="how many top cards to refresh")
    ap.add_argument("--per-card-limit", type=int, default=20,
                    help="max listings to fetch per card (default 20)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", action="store_true")
    args = ap.parse_args()

    # Quick env check — accept any of the supported credential pairs
    env = (os.environ.get("EBAY_ENV") or "production").lower()
    if env == "sandbox":
        cid = os.environ.get("EBAY_SANDBOX_CLIENT_ID") or os.environ.get("EBAY_CLIENT_ID")
        sec = os.environ.get("EBAY_SANDBOX_CLIENT_SECRET") or os.environ.get("EBAY_CLIENT_SECRET")
    else:
        cid = os.environ.get("EBAY_PROD_CLIENT_ID") or os.environ.get("EBAY_CLIENT_ID")
        sec = os.environ.get("EBAY_PROD_CLIENT_SECRET") or os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not sec:
        print(f"ERROR: eBay credentials missing for env={env}.")
        print("       Set EBAY_PROD_CLIENT_ID + EBAY_PROD_CLIENT_SECRET (or sandbox variants).")
        return 2

    cards = _candidate_cards(args.top)
    used_today = ebay_call_count()
    print(f"eBay Browse refresh plan:")
    print(f"  Daily counter:  {used_today}/{DAILY_LIMIT}")
    print(f"  Cards to query: {len(cards)} (1 call each)")
    print(f"  Estimated max:  {len(cards)} calls")
    if cards:
        print(f"\n  Top cards by activity:")
        for c in cards[:5]:
            print(f"    {c['player_name']} #{c['card_number']} ({c['release_year']} {c['release_name'][:30]})  sales_30d={c['sales_30d']}")

    if args.dry_run:
        print("\nDry run; no calls made.")
        return 0

    if not args.yes:
        ans = input(f"\nProceed with {len(cards)} eBay Browse calls? [y/N] ").strip().lower()
        if ans != "y":
            return 1

    with LoaderRun("refresh_active_listings_ebay.py", source="ebay-browse",
                   params={"top": args.top}) as run:
        provenance = run.stamp()
        provenance["source_system"] = "ebay-browse"
        total_written = 0
        ok, fail = 0, 0
        for c in cards:
            q = _build_query(c)
            body = search_items(
                q=q,
                category_ids=CATEGORY_SPORTS_TRADING_CARDS,
                limit=args.per_card_limit,
                filter_str="buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:US",
                sort="price",
                fieldgroups="MATCHING_ITEMS",
            )
            run.add_api_calls(1)
            if "_error" in body:
                fail += 1
                print(f"  ! {c['player_name']} #{c['card_number']}: HTTP {body.get('_status')}")
                continue
            items = body.get("itemSummaries") or []
            rows = [_record_to_row(c["card_id"], it, provenance) for it in items]
            written = _replace_ebay_listings(c["card_id"], rows)
            run.add_rows_written(written)
            total_written += written
            ok += 1
            print(f"  ✓ {c['player_name'][:25]:<25s} #{c['card_number']:<6s}  {written:>3d} listings")
        print(f"\nDone. {ok}/{len(cards)} cards refreshed, {fail} failed.")
        print(f"Total active_listings rows written: {total_written}")
        print(f"eBay calls used today: {ebay_call_count()}/{DAILY_LIMIT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
