"""Compute per-card per-grade daily price snapshots.

Reads `sales`, groups by (card_id, sold_at::date, grader, grade_value),
writes one row per group into `price_snapshots`. This gives the web layer
real per-grade pricing — PSA 10 / PSA 9 / BGS 9.5 / BGS 9 / Raw broken out
separately, which `analytics_daily` can't represent because it only has
two pre-baked grade buckets (raw, PSA 10).

Idempotent: the upsert keys on (card_id, snapshot_date, grader, grade_value).

Usage:
    python src/per_grade_snapshots.py                # last 90 days
    python src/per_grade_snapshots.py --days 30      # tighter window
"""
from __future__ import annotations

import argparse
import os
import sys
import statistics as stats
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))
from loader_run import LoaderRun  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

ALLOWED_GRADERS = {"PSA", "BGS", "SGC", "CGC"}


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_sales(days: int) -> list[dict]:
    """Pull recent graded+raw sales. Supabase REST has a default 1000 row
    cap per query — use keyset pagination on `id` to walk through it."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows: list[dict] = []
    last_id = 0
    PAGE = 1000
    while True:
        r = (
            sb.table("sales")
            .select("id, card_id, sold_at, price_usd, is_graded, grader, grade_value")
            .gte("sold_at", cutoff)
            .gt("id", last_id)
            .order("id", desc=False)
            .limit(PAGE)
            .execute()
        )
        if not r.data:
            break
        rows.extend(r.data)
        last_id = r.data[-1]["id"]
        # If we got fewer than the page size, that was the last page.
        if len(r.data) < PAGE:
            break
        if len(rows) % 50000 == 0:
            print(f"    ...{len(rows):,} so far")
    return rows


def aggregate(sales: list[dict]) -> list[dict]:
    """Group by (card, date, grader, grade_value) -> daily aggregate row."""
    buckets: dict[tuple, list[float]] = defaultdict(list)
    for s in sales:
        date = _parse_dt(s["sold_at"]).date()
        if s["is_graded"]:
            grader = s.get("grader") or "UNKNOWN"
            grade = str(s.get("grade_value") or "?")
        else:
            grader, grade = "RAW", "RAW"
        # filter known graders + raw only
        if grader not in (ALLOWED_GRADERS | {"RAW"}):
            continue
        try:
            price = float(s["price_usd"])
        except Exception:
            continue
        if price <= 0:
            continue
        buckets[(s["card_id"], date, grader, grade)].append(price)

    rows: list[dict] = []
    for (cid, date, grader, grade), prices in buckets.items():
        prices.sort()
        rows.append({
            "card_id": cid,
            "snapshot_date": str(date),
            "grader": grader,
            "grade_value": grade,
            "sale_count": len(prices),
            "sum_price_usd": round(sum(prices), 2),
            "vwap_usd": round(sum(prices) / len(prices), 2),
            "min_price_usd": round(prices[0], 2),
            "max_price_usd": round(prices[-1], 2),
            "median_usd": round(stats.median(prices), 2),
        })
    return rows


def upsert(rows: list[dict], provenance: dict) -> int:
    if not rows:
        return 0
    written = 0
    for i in range(0, len(rows), 500):
        chunk = [{**r, **provenance} for r in rows[i:i + 500]]
        sb.table("price_snapshots").upsert(
            chunk, on_conflict="card_id,snapshot_date,grader,grade_value"
        ).execute()
        written += len(chunk)
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90, help="lookback window (default 90)")
    args = ap.parse_args()

    print(f"Fetching sales from last {args.days} days...")
    sales = fetch_sales(args.days)
    print(f"  {len(sales):,} sale rows")

    rows = aggregate(sales)
    print(f"  {len(rows):,} per-grade-day buckets to upsert")

    with LoaderRun("per_grade_snapshots.py", source="derived",
                   params={"days": args.days}) as run:
        provenance = run.stamp()
        n = upsert(rows, provenance)
        run.add_rows_written(n)
        run.add_rows_read(len(sales))
        print(f"  ✓ wrote {n:,} rows to price_snapshots")
    return 0


if __name__ == "__main__":
    sys.exit(main())
