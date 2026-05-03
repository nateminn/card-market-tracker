"""Show recent loader runs from the loader_runs audit table.

Usage:
    python src/loader_status.py                    # last 20 runs
    python src/loader_status.py --limit 50         # last 50
    python src/loader_status.py --script seed_card_images.py
    python src/loader_status.py --failed           # only failed runs
    python src/loader_status.py --stuck            # 'running' status, started >1h ago
    python src/loader_status.py --show <id>        # full detail of one run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent


def get_client():
    load_dotenv(ROOT / ".env")
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


STATUS_GLYPHS = {
    "succeeded": "✓",
    "failed": "✗",
    "running": "↻",
}


def fmt_duration(start_iso: str | None, end_iso: str | None) -> str:
    if not start_iso:
        return "—"
    start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = (
        datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        if end_iso
        else datetime.now(timezone.utc)
    )
    sec = (end - start).total_seconds()
    if sec < 60:
        return f"{sec:.1f}s"
    if sec < 3600:
        return f"{sec / 60:.1f}m"
    return f"{sec / 3600:.1f}h"


def fmt_when(iso: str) -> str:
    when = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return when.astimezone().strftime("%Y-%m-%d %H:%M")


def cmd_list(sb, args) -> int:
    q = sb.table("loader_runs").select("*").order("started_at", desc=True).limit(args.limit)
    if args.script:
        q = q.eq("script_name", args.script)
    if args.failed:
        q = q.eq("status", "failed")
    if args.stuck:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        q = q.eq("status", "running").lt("started_at", cutoff)
    try:
        r = q.execute()
    except Exception as exc:  # noqa: BLE001
        if "loader_runs" in str(exc) and (
            "does not exist" in str(exc) or "Could not find" in str(exc)
        ):
            print(
                "loader_runs table doesn't exist yet. Apply migration 002:\n"
                "  python src/migrate.py up 002_loader_runs"
            )
            return 2
        raise

    rows = r.data or []
    if not rows:
        print("No runs match.")
        return 0

    print(
        f"{'STATUS':>1}  {'WHEN':16s}  {'DUR':>6s}  {'ROWS':>6s}  {'API':>4s}  "
        f"{'SCRIPT':30s}  ID"
    )
    print("─" * 86)
    for r in rows:
        glyph = STATUS_GLYPHS.get(r["status"], "?")
        when = fmt_when(r["started_at"])
        dur = fmt_duration(r["started_at"], r.get("finished_at"))
        rows_n = r.get("rows_written") or 0
        api_n = r.get("api_calls") or 0
        script = r["script_name"][:30]
        print(
            f"{glyph:>1}  {when:16s}  {dur:>6s}  {rows_n:>6,d}  {api_n:>4,d}  "
            f"{script:30s}  {r['id'][:8]}..."
        )
    return 0


def cmd_show(sb, run_id: str) -> int:
    # Match by full uuid OR by short prefix.
    if len(run_id) < 36:
        # short form: query for ids starting with this prefix (PostgREST has no
        # "starts with" on uuid, so do a prefix match via gte/lt range)
        q = sb.table("loader_runs").select("*").gte("id", run_id).lt("id", run_id + "z")
    else:
        q = sb.table("loader_runs").select("*").eq("id", run_id)
    rows = q.limit(1).execute().data or []
    if not rows:
        print(f"No loader_runs row matches '{run_id}'.")
        return 1
    r = rows[0]
    print(f"id:            {r['id']}")
    print(f"script:        {r['script_name']}")
    print(f"source:        {r.get('source_system') or '—'}")
    print(f"status:        {r['status']}")
    print(f"started_at:    {fmt_when(r['started_at'])}")
    if r.get("finished_at"):
        print(f"finished_at:   {fmt_when(r['finished_at'])}")
        print(f"duration:      {fmt_duration(r['started_at'], r['finished_at'])}")
    print(f"rows_read:     {r.get('rows_read') or 0:,}")
    print(f"rows_written:  {r.get('rows_written') or 0:,}")
    print(f"api_calls:     {r.get('api_calls') or 0:,}")
    if r.get("notes"):
        print(f"notes:         {r['notes']}")
    if r.get("params"):
        print(f"params:        {json.dumps(r['params'], indent=2)}")
    if r.get("error_message"):
        print(f"\n--- error_message ---\n{r['error_message']}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Show recent loader runs from the loader_runs audit table.",
    )
    ap.add_argument("--limit", type=int, default=20, help="max runs to list")
    ap.add_argument("--script", help="filter by script_name")
    ap.add_argument("--failed", action="store_true", help="only failed runs")
    ap.add_argument(
        "--stuck",
        action="store_true",
        help="runs still in 'running' status >1h after starting",
    )
    ap.add_argument("--show", help="show full detail of one run id (full or 8-char prefix)")
    args = ap.parse_args()

    sb = get_client()
    if args.show:
        return cmd_show(sb, args.show)
    return cmd_list(sb, args)


if __name__ == "__main__":
    sys.exit(main())
