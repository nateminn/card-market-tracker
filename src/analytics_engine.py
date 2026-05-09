"""
analytics_engine.py — compute per-card metrics from `sales`, write to
`analytics_daily`, print a ranked report.

Computes:
  vwap_7d / vwap_30d / vwap_90d   (mean price within rolling window — schema
                                   calls these vwap; we use simple mean today)
  raw_vwap_30d                    (subset where is_graded=false)
  psa10_vwap_30d                  (subset where grader='PSA' grade='10')
  sales_count_30d
  velocity_score                  (sales/day in last 30d)
  momentum_score                  ((vwap_7d - vwap_30d) / vwap_30d)
  confidence_rating               (high/medium/low/insufficient — printed only)

Skipped (no upstream data yet):
  scarcity_score, gem_rate        (need PSA pop data — Step 4 deferred)
  active_listings_count, bid_ask_spread (need eBay listings — Step 8)
  variant_multiplier              (we only model base cards in card_identity)

Usage:
    .venv/bin/python src/analytics_engine.py
    .venv/bin/python src/analytics_engine.py --top 20
"""

from __future__ import annotations

import argparse
import os
import statistics
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
import sys

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))
from loader_run import LoaderRun  # noqa: E402

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

TODAY = date.today()
NOW = datetime.now(timezone.utc)


def _parse_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_recent_sales(days: int = 90) -> list[dict]:
    """Fetch all sales rows in the trailing `days` window.

    Uses keyset pagination on `id` (the primary key) instead of offset
    pagination. Offset pagination over 1M+ rows triggers a Postgres
    statement timeout because each `.range(N, N+999)` query has to scan
    and discard the first N rows. Keyset uses the PK index directly:
    O(n) instead of O(n²).
    """
    since = (NOW - timedelta(days=days)).isoformat()
    out: list[dict] = []
    chunk = 1000
    last_id: str | None = None
    while True:
        q = (
            client.table("sales")
            .select("id, card_id, sold_at, price_usd, is_graded, grader, grade_value")
            .gte("sold_at", since)
            .order("id")
            .limit(chunk)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        rows = q.execute().data or []
        if not rows:
            break
        out.extend(rows)
        last_id = rows[-1]["id"]
        if len(rows) < chunk:
            break
    return out


def _mean_price(sales: list[dict]) -> float | None:
    if not sales:
        return None
    return round(statistics.mean(float(s["price_usd"]) for s in sales), 2)


def _in_window(sales: list[dict], days: int) -> list[dict]:
    cutoff = NOW - timedelta(days=days)
    return [s for s in sales if _parse_dt(s["sold_at"]) >= cutoff]


def confidence_rating(sales_90d: int) -> str:
    if sales_90d < 3:
        return "insufficient"
    if sales_90d < 10:
        return "low"
    if sales_90d < 30:
        return "medium"
    return "high"


def compute_metrics(card_id: str, sales: list[dict]) -> dict:
    s7 = _in_window(sales, 7)
    s30 = _in_window(sales, 30)
    s90 = _in_window(sales, 90)
    raw_30 = [s for s in s30 if not s["is_graded"]]
    psa10_30 = [
        s for s in s30
        if s["is_graded"] and s.get("grader") == "PSA" and str(s.get("grade_value")) == "10"
    ]

    vwap_7 = _mean_price(s7)
    vwap_30 = _mean_price(s30)

    momentum = None
    if vwap_7 is not None and vwap_30:
        momentum = round((vwap_7 - vwap_30) / vwap_30, 4)

    velocity = round(len(s30) / 30.0, 3) if s30 else None

    return {
        "card_id": card_id,
        "snapshot_date": str(TODAY),
        "vwap_7d_usd": vwap_7,
        "vwap_30d_usd": vwap_30,
        "vwap_90d_usd": _mean_price(s90),
        "raw_vwap_30d_usd": _mean_price(raw_30),
        "psa10_vwap_30d_usd": _mean_price(psa10_30),
        "sales_count_30d": len(s30),
        "active_listings_count": None,
        "velocity_score": velocity,
        "scarcity_score": None,
        "gem_rate": None,
        "momentum_score": momentum,
    }


def upsert_analytics(rows: list[dict], provenance: dict | None = None) -> None:
    if provenance:
        rows = [{**r, **provenance} for r in rows]
    for i in range(0, len(rows), 500):
        client.table("analytics_daily").upsert(
            rows[i:i + 500], on_conflict="card_id,snapshot_date"
        ).execute()


def print_top_report(rows: list[dict], top_n: int) -> None:
    rows_sorted = sorted(rows, key=lambda r: r["sales_count_30d"] or 0, reverse=True)[:top_n]
    if not rows_sorted:
        return
    ids = [r["card_id"] for r in rows_sorted]
    cards = (
        client.table("card_identity")
        .select("id, player_name, card_number, releases(year, name), sets(name)")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    by_id = {c["id"]: c for c in cards}

    # Compute confidence using the rows themselves (sales_count_90d isn't stored, use 30d as proxy)
    print(f"\nTop {len(rows_sorted)} cards by sales_count_30d:")
    print(
        f"  {'#':>2}  {'30d':>4}  {'vwap30d':>9}  {'raw30d':>9}  {'psa10_30d':>10}  "
        f"{'mom':>7}  {'conf':>6}  card"
    )
    for i, r in enumerate(rows_sorted):
        c = by_id.get(r["card_id"], {})
        rel = c.get("releases") or {}
        st = c.get("sets") or {}
        label = (
            f"{rel.get('year','?')} {rel.get('name','?')} / {st.get('name','?')} "
            f"#{c.get('card_number','?')} {c.get('player_name','?')}"
        )
        def _fmt(x):
            return f"${x:,.0f}" if x is not None else "-"
        mom = f"{r['momentum_score']*100:+.1f}%" if r["momentum_score"] is not None else "-"
        conf = confidence_rating(r["sales_count_30d"])  # proxy, see comment above
        print(
            f"  {i+1:>2}  {r['sales_count_30d']:>4}  "
            f"{_fmt(r['vwap_30d_usd']):>9}  "
            f"{_fmt(r['raw_vwap_30d_usd']):>9}  "
            f"{_fmt(r['psa10_vwap_30d_usd']):>10}  "
            f"{mom:>7}  {conf:>6}  {label}"
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    with LoaderRun(
        "analytics_engine.py",
        source="derived",
        params={"top": args.top, "snapshot_date": str(TODAY)},
    ) as run:
        provenance = run.stamp()

        print(f"Computing analytics for {TODAY}...")
        sales = fetch_recent_sales(days=90)
        run.add_rows_read(len(sales))
        print(f"  Pulled {len(sales)} sales rows from last 90 days")
        by_card: dict[str, list[dict]] = {}
        for s in sales:
            by_card.setdefault(s["card_id"], []).append(s)
        print(f"  {len(by_card)} unique cards have sales in window")

        rows = [compute_metrics(cid, ss) for cid, ss in by_card.items()]
        upsert_analytics(rows, provenance=provenance)
        run.add_rows_written(len(rows))
        print(f"  Upserted {len(rows)} analytics_daily rows for {TODAY}")

        skipped = [
            ("scarcity_score", "needs PSA pop data (Step 4 deferred)"),
            ("gem_rate", "needs PSA pop data"),
            ("active_listings_count", "needs eBay listings (Step 8 not built)"),
            ("variant_multiplier", "we only model base cards in card_identity today"),
        ]
        print("\nSkipped metrics (graceful):")
        for name, why in skipped:
            print(f"  {name:25s}  {why}")

        print_top_report(rows, args.top)
        print()


if __name__ == "__main__":
    main()
