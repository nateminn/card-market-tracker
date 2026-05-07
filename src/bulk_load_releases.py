"""Bulk-load multiple CardSight releases into Supabase.

Workflow:
  1. Read ranked candidates from `discover_releases.py`
  2. For each release: pull JSON via pull_set.py, then load via load_to_supabase.py
  3. Track total CardSight calls + Supabase rows added

Usage:
    # dry-run: show what would happen
    python src/bulk_load_releases.py --top 5 --dry-run

    # actually run for the top 5 highest-scoring releases
    python src/bulk_load_releases.py --top 5 --yes

    # run for specific release IDs
    python src/bulk_load_releases.py --ids id1,id2,id3 --yes

    # cap CardSight calls to a budget
    python src/bulk_load_releases.py --top 30 --max-calls 100 --yes

Safety:
  - Always prompts before burning calls unless --yes
  - Each release pull is idempotent (load_to_supabase upserts on id)
  - --max-calls hard-stops the run if budget would be exceeded
  - Writes all activity to loader_runs (when migration 002 is applied)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "exploration"))

from discover_releases import rank_releases  # noqa: E402
from _client import call_count  # noqa: E402
from loader_run import LoaderRun  # noqa: E402

MONTHLY_BUDGET = 5000  # CardSight Pro tier (was 750 on free tier)


def list_loaded_data_files() -> set[str]:
    """release_id strings whose data file already exists locally."""
    out: set[str] = set()
    for f in (ROOT / "data").glob("release_*.json"):
        if "_summary" in f.name:
            continue
        # filename: release_<uuid>.json
        try:
            rid = f.stem.removeprefix("release_")
            out.add(rid)
        except Exception:
            pass
    return out


def pull_release(release_id: str, name: str, year: str) -> tuple[bool, int]:
    """Run pull_set.py for one release. Returns (ok, calls_used)."""
    before = call_count()
    print(f"\n  → Pulling {year} {name}  ({release_id[:8]}...)")
    cmd = [sys.executable, str(ROOT / "src" / "pull_set.py"), release_id]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"    pull_set FAILED:")
        print(proc.stdout[-500:])
        print(proc.stderr[-500:])
        return False, call_count() - before
    # pull_set prints a summary; surface the last few lines
    tail = proc.stdout.strip().splitlines()[-5:]
    for line in tail:
        print(f"    {line}")
    return True, call_count() - before


def load_release_to_supabase(release_id: str) -> bool:
    """Run load_to_supabase.py for one release file."""
    data_path = ROOT / "data" / f"release_{release_id}.json"
    if not data_path.exists():
        print(f"    ✗ no data file at {data_path}")
        return False
    print(f"    Loading into Supabase...")
    cmd = [sys.executable, str(ROOT / "src" / "load_to_supabase.py"), str(data_path)]
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"    load_to_supabase FAILED:")
        print(proc.stdout[-500:])
        print(proc.stderr[-500:])
        return False
    tail = proc.stdout.strip().splitlines()[-3:]
    for line in tail:
        print(f"    {line}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, help="load top N ranked releases")
    ap.add_argument("--ids", help="comma-separated release IDs to load")
    ap.add_argument("--max-calls", type=int, help="hard cap on CardSight calls for this run")
    ap.add_argument("--dry-run", action="store_true", help="print plan, do nothing")
    ap.add_argument("--yes", "-y", action="store_true", help="skip confirmation")
    args = ap.parse_args()

    # Decide which releases
    if args.ids:
        ids = [s.strip() for s in args.ids.split(",") if s.strip()]
        ranked = rank_releases()
        by_id = {r["id"]: r for r in ranked}
        targets = [
            by_id.get(i, {"id": i, "name": "(unknown)", "year": "?", "estimated_calls": 11})
            for i in ids
        ]
    elif args.top:
        targets = rank_releases()[: args.top]
    else:
        ap.error("provide --top N or --ids id1,id2,...")
        return 2

    if not targets:
        print("No releases to load.")
        return 0

    # Skip releases whose JSON is already cached AND already in Supabase
    # (we still re-load it in case of a partial earlier load — load is
    # idempotent via upsert.)
    cached = list_loaded_data_files()
    pull_count = sum(1 for t in targets if t["id"] not in cached)
    expected_calls = sum(
        t.get("estimated_calls", 11) for t in targets if t["id"] not in cached
    )

    used = call_count()
    remaining = MONTHLY_BUDGET - used

    print(f"\nBulk-load plan ({len(targets)} releases):")
    print(f"  Already cached locally: {len(targets) - pull_count}")
    print(f"  Need fresh pulls: {pull_count}")
    print(f"  Estimated CardSight calls: {expected_calls}")
    print(f"  CardSight budget: {used} used / {MONTHLY_BUDGET} ({remaining} remaining)")
    print()
    for i, t in enumerate(targets, 1):
        cached_flag = " (cached)" if t["id"] in cached else ""
        print(
            f"  {i:>2}. {t.get('year', '?'):>6}  {t.get('segment', '?'):>10}  "
            f"~{t.get('estimated_calls', 11):>3} calls  {t['name']}{cached_flag}"
        )

    if args.max_calls and expected_calls > args.max_calls:
        print(f"\n  ✗ Plan needs ~{expected_calls} calls but --max-calls is {args.max_calls}.")
        print(f"    Reduce --top or raise --max-calls.")
        return 1

    if args.dry_run:
        print("\n  --dry-run: no calls made.")
        return 0

    if not args.yes:
        ans = input(f"\nContinue? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("Cancelled.")
            return 0

    with LoaderRun(
        "bulk_load_releases.py",
        source="cardsight",
        params={
            "release_ids": [t["id"] for t in targets],
            "expected_calls": expected_calls,
        },
        notes=f"Bulk catalog ingest: {len(targets)} releases.",
    ) as run:
        ok_count = 0
        fail_count = 0
        for t in targets:
            rid = t["id"]
            year = str(t.get("year", "?"))
            name = t.get("name", "(unknown)")
            if rid not in cached:
                ok, calls = pull_release(rid, name, year)
                run.add_api_calls(calls)
                if not ok:
                    fail_count += 1
                    continue
            ok = load_release_to_supabase(rid)
            if ok:
                ok_count += 1
            else:
                fail_count += 1
            time.sleep(0.5)  # be polite

        run.add_rows_written(ok_count)
        print(f"\nDone.")
        print(f"  Successful releases: {ok_count}/{len(targets)}")
        if fail_count:
            print(f"  Failed releases:     {fail_count}")
        print(f"  CardSight calls used now: {call_count()}/{MONTHLY_BUDGET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
