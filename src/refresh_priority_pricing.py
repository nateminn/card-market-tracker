"""Refresh pricing data for high-priority cards within budget.

Pricing is the binding constraint on the CardSight free tier (1 call/card,
750 calls/month). This script picks which cards to refresh by stitching
together several priority sources, then hits /pricing/{card_id} for each up
to a hard call budget.

Priority order (cards earlier in the list win when budget is tight):
  1. WATCHLIST   — cards the user explicitly tracks
  2. STARS       — curated UUIDs (same SEEDS map as seed_card_images.py)
  3. STALE       — cards with at least one sale, but newest sale older
                   than --days-stale (default 7d). Older = higher priority.
  4. UNPRICED    — cards in the catalog with zero sales rows yet, ranked
                   by some heuristic (rookie + numeric card_number first).
                   Off by default; opt in with --include-unpriced because
                   most catalog cards just don't have CardSight data and
                   would be wasted calls.

Idempotent: every sale upsert dedupes on (card_id, external_id).
Safe: refuses to exceed --max-calls; default 100 keeps you well under
budget even if run frequently.

Usage:
    python src/refresh_priority_pricing.py --dry-run           # show plan
    python src/refresh_priority_pricing.py --yes               # default 100
    python src/refresh_priority_pricing.py --max-calls 30 --yes
    python src/refresh_priority_pricing.py --days-stale 14 --yes
    python src/refresh_priority_pricing.py --include-unpriced --max-calls 50 --yes
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "exploration"))
sys.path.insert(0, str(ROOT / "src"))
from _client import call, call_count  # noqa: E402
from loader_run import LoaderRun  # noqa: E402
from seed_card_images import SEEDS as STAR_SEEDS  # noqa: E402

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

MONTHLY_BUDGET = 750
DEFAULT_MAX_CALLS = 100


# ---------------------------------------------------------------------------
# Candidate collection
# ---------------------------------------------------------------------------


@dataclass
class Candidate:
    card_id: str
    score: int  # higher = more important
    reasons: list[str] = field(default_factory=list)
    label: str | None = None  # human-readable label (player_name etc.)
    days_stale: int | None = None


def _watchlist_ids() -> list[str]:
    r = client.table("watchlist").select("card_id").execute()
    return [w["card_id"] for w in (r.data or [])]


def _newest_sale_per_card() -> dict[str, datetime]:
    """Return {card_id: newest_sold_at} across all sales (paginated)."""
    out: dict[str, datetime] = {}
    offset = 0
    while True:
        r = (
            client.table("sales")
            .select("card_id, sold_at")
            .order("sold_at", desc=True)
            .range(offset, offset + 999)
            .execute()
        )
        if not r.data:
            break
        for s in r.data:
            cid = s["card_id"]
            ts = datetime.fromisoformat(s["sold_at"].replace("Z", "+00:00"))
            if cid not in out or ts > out[cid]:
                out[cid] = ts
        if len(r.data) < 1000:
            break
        offset += 1000
    return out


def _card_exists(card_ids: list[str]) -> set[str]:
    """Return the subset of card_ids that exist in card_identity."""
    found: set[str] = set()
    for i in range(0, len(card_ids), 200):
        chunk = card_ids[i : i + 200]
        r = (
            client.table("card_identity")
            .select("id")
            .in_("id", chunk)
            .execute()
        )
        for row in r.data or []:
            found.add(row["id"])
    return found


def _card_labels(card_ids: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for i in range(0, len(card_ids), 200):
        chunk = card_ids[i : i + 200]
        r = (
            client.table("card_identity")
            .select("id, player_name, card_number")
            .in_("id", chunk)
            .execute()
        )
        for row in r.data or []:
            out[row["id"]] = (
                f"{row['player_name']} #{row.get('card_number') or '?'}"
            )
    return out


def _unpriced_candidates(limit: int = 50) -> list[str]:
    """Cards in card_identity with no sales rows yet — heuristic-ranked.
    Prioritize rookies with numeric card_numbers (most likely to have
    CardSight data; filters out auto / insert UUIDs)."""
    # Pull recent rookies with numeric card numbers.
    r = (
        client.table("card_identity")
        .select("id, card_number")
        .eq("is_rookie", True)
        .is_("parent_card_id", "null")
        .limit(2000)
        .execute()
    )
    cands = [
        c["id"]
        for c in (r.data or [])
        if (c.get("card_number") or "").isdigit()
    ]
    # Subtract those that already have at least one sale.
    sales_r = (
        client.table("sales")
        .select("card_id")
        .in_("card_id", cands[:1000])  # PostgREST IN cap
        .execute()
    )
    have_sales = {row["card_id"] for row in (sales_r.data or [])}
    return [c for c in cands if c not in have_sales][:limit]


def collect_candidates(
    days_stale: int,
    include_watchlist: bool,
    include_stars: bool,
    include_unpriced: bool,
) -> list[Candidate]:
    by_id: dict[str, Candidate] = {}
    now = datetime.now(timezone.utc)

    # 1) Watchlist — top priority
    if include_watchlist:
        for cid in _watchlist_ids():
            by_id.setdefault(cid, Candidate(card_id=cid, score=0)).reasons.append("watchlist")
            by_id[cid].score = max(by_id[cid].score, 1000)

    # 2) Stars (curated UUIDs from seed_card_images)
    if include_stars:
        # STAR_SEEDS is {player_name: uuid}
        for name, cid in STAR_SEEDS.items():
            if cid not in by_id:
                by_id[cid] = Candidate(card_id=cid, score=500, label=name)
            by_id[cid].reasons.append("star")
            by_id[cid].score = max(by_id[cid].score, 500)

    # 3) Stale: cards with sales but the newest one is too old
    newest = _newest_sale_per_card()
    for cid, ts in newest.items():
        days = (now - ts).days
        if days < days_stale:
            continue
        if cid not in by_id:
            by_id[cid] = Candidate(card_id=cid, score=days)
        by_id[cid].reasons.append(f"stale-{days}d")
        by_id[cid].days_stale = days
        by_id[cid].score = max(by_id[cid].score, 100 + days)

    # 4) Unpriced (opt-in)
    if include_unpriced:
        for cid in _unpriced_candidates(limit=50):
            if cid not in by_id:
                by_id[cid] = Candidate(card_id=cid, score=50)
            by_id[cid].reasons.append("unpriced")

    # Filter to cards that actually exist in card_identity (some star UUIDs
    # belong to releases we haven't loaded — those would FK-fail on insert).
    existing = _card_exists(list(by_id.keys()))
    skipped_missing = [c for c in by_id if c not in existing]
    if skipped_missing:
        print(
            f"  ⓘ Skipping {len(skipped_missing)} candidates whose card_id "
            f"isn't in card_identity (release not loaded yet)."
        )
    candidates = [by_id[c] for c in existing]

    # Decorate with player labels
    labels = _card_labels([c.card_id for c in candidates])
    for c in candidates:
        if not c.label:
            c.label = labels.get(c.card_id, c.card_id[:8])

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


# ---------------------------------------------------------------------------
# Pricing fetch + upsert (mirrors refresh_watchlist_prices.py logic)
# ---------------------------------------------------------------------------


def _make_external_id(rec: dict) -> str:
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


def _record_to_row(card_id: str, rec: dict, *, is_graded, grader, grade_value, provenance: dict):
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
        # CardSight tags every record with the parallel it came from. Storing
        # both the uuid and the human-readable name; the name is what we
        # render, the uuid is what we filter/group by.
        "parallel_id": rec.get("parallel_id"),
        "parallel_name": rec.get("parallel_name"),
        "raw_payload": rec,
        "external_id": _make_external_id(rec),
        **provenance,
    }


def _parse_pricing(card_id: str, body: dict, provenance: dict) -> list[dict]:
    rows: list[dict] = []
    raw_block = body.get("raw") or {}
    for rec in raw_block.get("records") or []:
        rows.append(_record_to_row(card_id, rec, is_graded=False, grader=None, grade_value=None, provenance=provenance))
    for company in body.get("graded") or []:
        gname = company.get("company_name")
        for grade in company.get("grades") or []:
            gv = grade.get("grade_value")
            gv_str = str(gv) if gv is not None else None
            for rec in grade.get("records") or []:
                rows.append(
                    _record_to_row(
                        card_id, rec,
                        is_graded=True, grader=gname, grade_value=gv_str,
                        provenance=provenance,
                    )
                )
    return rows


def _upsert_sales(rows: list[dict]) -> int:
    if not rows:
        return 0
    seen: dict[tuple, dict] = {}
    for r in rows:
        seen[(r["card_id"], r["external_id"])] = r
    deduped = list(seen.values())
    for i in range(0, len(deduped), 500):
        client.table("sales").upsert(
            deduped[i : i + 500],
            on_conflict="card_id,external_id",
            ignore_duplicates=True,
        ).execute()
    return len(deduped)


def _count_for_card(card_id: str) -> int:
    r = (
        client.table("sales")
        .select("id", count="exact", head=True)
        .eq("card_id", card_id)
        .execute()
    )
    return r.count or 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=DEFAULT_MAX_CALLS,
                    help=f"hard cap on CardSight calls (default {DEFAULT_MAX_CALLS})")
    ap.add_argument("--days-stale", type=int, default=7,
                    help="cards whose newest sale is older than N days are 'stale'")
    ap.add_argument("--no-watchlist", action="store_true")
    ap.add_argument("--no-stars", action="store_true")
    ap.add_argument("--include-unpriced", action="store_true",
                    help="also refresh catalog cards with zero sales (off by default)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", "-y", action="store_true")
    args = ap.parse_args()

    print("Collecting priority candidates...")
    candidates = collect_candidates(
        days_stale=args.days_stale,
        include_watchlist=not args.no_watchlist,
        include_stars=not args.no_stars,
        include_unpriced=args.include_unpriced,
    )

    if not candidates:
        print("Nothing to refresh.")
        return 0

    plan = candidates[: args.max_calls]
    used = call_count()
    remaining = MONTHLY_BUDGET - used

    print(f"\nPlan: refresh {len(plan)} card(s)  (capped at --max-calls={args.max_calls})")
    print(f"  CardSight budget: {used} used / {MONTHLY_BUDGET}  ({remaining} remaining)")
    print(f"  Total candidates discovered: {len(candidates)}")
    print()
    print(f"  {'#':>3}  {'SCORE':>5}  {'STALE':>5}  REASONS                CARD")
    print("  " + "─" * 70)
    for i, c in enumerate(plan, 1):
        stale = f"{c.days_stale}d" if c.days_stale is not None else ""
        reasons = "+".join(c.reasons)
        print(f"  {i:>3}  {c.score:>5}  {stale:>5}  {reasons:22s}  {c.label}")

    if len(candidates) > args.max_calls:
        print(f"\n  ({len(candidates) - args.max_calls} more candidates skipped due to --max-calls.)")

    if remaining < len(plan):
        print(f"\n  ✗ Plan needs {len(plan)} calls but only {remaining} left in monthly budget.")
        return 1

    if args.dry_run:
        print("\n  --dry-run: no calls made.")
        return 0

    if not args.yes:
        ans = input(f"\nContinue and use {len(plan)} CardSight calls? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("Cancelled.")
            return 0

    # Execute
    with LoaderRun(
        "refresh_priority_pricing.py",
        source="cardsight",
        params={
            "max_calls": args.max_calls,
            "days_stale": args.days_stale,
            "include_unpriced": args.include_unpriced,
            "candidates": len(candidates),
            "planned": len(plan),
        },
        notes="Priority-driven pricing refresh.",
    ) as run:
        provenance = run.stamp()
        new_rows_total = 0
        ok = 0
        notfound = 0
        for c in plan:
            cid = c.card_id
            before = _count_for_card(cid)
            status, body = call(f"/pricing/{cid}", save_as=None)
            run.add_api_calls(1)
            if status == 404:
                notfound += 1
                print(f"  {c.label:35s}  404 (no pricing for this card)")
                continue
            if status != 200:
                print(f"  {c.label:35s}  status {status}, skipped")
                continue
            rows = _parse_pricing(cid, body, provenance)
            run.add_rows_read(len(rows))
            try:
                _upsert_sales(rows)
            except Exception as exc:  # noqa: BLE001
                if "sales_card_id_fkey" in str(exc):
                    print(f"  {c.label:35s}  FK violation (release not in catalog), skipped")
                    continue
                raise
            after = _count_for_card(cid)
            new = after - before
            new_rows_total += new
            run.add_rows_written(new)
            ok += 1
            print(f"  {c.label:35s}  parsed {len(rows):>4} records, +{new:>3} new")
            time.sleep(0.3)

        print(f"\nDone.")
        print(f"  Refreshed: {ok}/{len(plan)}  (404s: {notfound})")
        print(f"  New sales rows: {new_rows_total}")
        print(f"  CardSight calls used now: {call_count()}/{MONTHLY_BUDGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
