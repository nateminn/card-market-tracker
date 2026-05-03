"""At-a-glance health of the Cardex backend.

Prints a one-screen overview: row counts per table, recent loader activity,
data-quality flags, CardSight call usage. Run this any time you want to
check "what's the state".

Usage:
    python src/data_health.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "exploration"))
from _client import call_count  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

CORE_TABLES = [
    "segments",
    "releases",
    "sets",
    "card_identity",
    "parallel_types",
    "sales",
    "active_listings",
    "watchlist",
    "analytics_daily",
    "population_snapshots",
]


def safe_count(table: str) -> int | None:
    """Return row count for a table, or None if the table doesn't exist.
    Uses select('*') because not every table has an `id` column
    (analytics_daily and population_snapshots use composite keys).
    """
    try:
        r = sb.table(table).select("*", count="exact", head=True).execute()
        return r.count or 0
    except Exception:
        return None


def fmt_rel(iso: str) -> str:
    """Relative time like '3m ago' / '2h ago' / '5d ago'."""
    when = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    delta = datetime.now(timezone.utc) - when
    sec = delta.total_seconds()
    if sec < 60:
        return f"{int(sec)}s ago"
    if sec < 3600:
        return f"{int(sec / 60)}m ago"
    if sec < 86400:
        return f"{int(sec / 3600)}h ago"
    return f"{int(sec / 86400)}d ago"


def section(title: str) -> None:
    print()
    print(title)
    print("─" * 70)


def main() -> int:
    print("=" * 70)
    print(f"CARDEX DATA HEALTH — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 70)

    # ── Row counts ────────────────────────────────────────────────
    section("Table sizes")
    for t in CORE_TABLES:
        n = safe_count(t)
        if n is None:
            print(f"  {t:24s}  (table missing)")
        else:
            print(f"  {t:24s}  {n:>10,}")

    # ── Coverage stats ────────────────────────────────────────────
    section("Coverage")
    total_cards = safe_count("card_identity") or 0
    try:
        with_img = (
            sb.table("card_identity")
            .select("id", count="exact", head=True)
            .not_.is_("image_url", "null")
            .execute()
            .count
            or 0
        )
        pct = (with_img / total_cards * 100) if total_cards else 0
        print(f"  Cards with image_url:  {with_img:>5,} / {total_cards:,}  ({pct:.1f}%)")
    except Exception as e:
        print(f"  Cards with image_url:  (query failed: {str(e)[:40]})")

    try:
        # PostgREST caps rows per request (~1000); paginate through all sales.
        seen_ids: set[str] = set()
        offset = 0
        while True:
            r = (
                sb.table("sales")
                .select("card_id")
                .range(offset, offset + 999)
                .execute()
            )
            if not r.data:
                break
            for row in r.data:
                seen_ids.add(row["card_id"])
            if len(r.data) < 1000:
                break
            offset += 1000
        print(f"  Cards with any sale:   {len(seen_ids):>5,} / {total_cards:,}")
    except Exception as e:
        print(f"  Cards with any sale:   (query failed: {str(e)[:40]})")

    # ── Loader activity ───────────────────────────────────────────
    section("Loader activity (last 7 days)")
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        runs = (
            sb.table("loader_runs")
            .select("script_name, status, started_at, finished_at, rows_written, api_calls")
            .gte("started_at", cutoff)
            .order("started_at", desc=True)
            .limit(10)
            .execute()
            .data
        ) or []
        if not runs:
            print("  No runs in last 7d (or migration 002 not applied yet).")
        else:
            for r in runs:
                glyph = {"succeeded": "✓", "failed": "✗", "running": "↻"}.get(
                    r["status"], "?"
                )
                rows = r.get("rows_written") or 0
                api = r.get("api_calls") or 0
                when = fmt_rel(r["started_at"])
                print(
                    f"  {glyph}  {when:>8s}  {rows:>5,d} rows  {api:>3,d} calls  "
                    f"{r['script_name']}"
                )
    except Exception as exc:
        if "loader_runs" in str(exc):
            print("  loader_runs table doesn't exist yet (apply migration 002).")
        else:
            print(f"  (query failed: {str(exc)[:60]})")

    # ── CardSight budget ──────────────────────────────────────────
    section("CardSight call budget")
    used = call_count()
    print(f"  This month: {used:,} / 750  ({750 - used:,} remaining)")

    # ── Quality flags ─────────────────────────────────────────────
    section("Quality flags")
    try:
        # Sales without image_url
        no_img = (
            sb.table("sales")
            .select("id", count="exact", head=True)
            .is_("image_url", "null")
            .execute()
            .count
            or 0
        )
        if no_img:
            print(f"  ⚠ {no_img} sales without image_url")

        # Sales in the future
        future = (
            sb.table("sales")
            .select("id", count="exact", head=True)
            .gt("sold_at", datetime.now(timezone.utc).isoformat())
            .execute()
            .count
            or 0
        )
        if future:
            print(f"  ⚠ {future} sales dated in the future")

        # Stuck loader runs (>1h running)
        try:
            stuck_cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            stuck = (
                sb.table("loader_runs")
                .select("id", count="exact", head=True)
                .eq("status", "running")
                .lt("started_at", stuck_cutoff)
                .execute()
                .count
                or 0
            )
            if stuck:
                print(f"  ⚠ {stuck} loader_runs stuck in 'running' for >1h")
        except Exception:
            pass

        if no_img == 0 and future == 0:
            print("  ✓ No quality flags raised.")
    except Exception as e:
        print(f"  (quality check failed: {str(e)[:60]})")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
