"""Harvest PSA cert numbers from sale titles and look them up via the PSA API.

Strategy:
  1. Scan sales table for PSA-graded sales whose external_title contains
     a candidate cert number (8-9 digit numeric).
  2. Skip certs we've already looked up (psa_certs table).
  3. Prioritise sales for cards with active analytics_daily rows
     (i.e. the cards users actually look at).
  4. Look up each via psa_client.lookup_cert.
  5. Store the response in psa_certs.
  6. Maintain psa_pop_by_spec aggregate.

Free tier: 100 calls/day. Default --max-calls 80 leaves headroom.

Usage:
    python src/psa_harvest.py --dry-run            # show plan, no calls
    python src/psa_harvest.py --max-calls 50 --yes # 50 lookups
    python src/psa_harvest.py --yes                # default 80 lookups
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))
from loader_run import LoaderRun  # noqa: E402
from psa_client import lookup_cert, call_count, DAILY_LIMIT  # noqa: E402

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Cert numbers in eBay titles are typically 8-9 digit numerics. Filter
# anything that looks like a year (1900-2099) since PSA certs aren't
# in that range.
CERT_RE = re.compile(r"\b(\d{8,9})\b")


def _candidate_certs(limit: int) -> list[tuple[str, str]]:
    """Return [(cert_number, source_card_id)] sorted by priority. Priority =
    cards with active analytics_daily rows first (top movers / high-volume),
    then everyone else."""
    seen: set[str] = set()
    # 1) certs already in psa_certs - skip these
    existing = sb.table("psa_certs").select("cert_number").execute().data or []
    seen.update(r["cert_number"] for r in existing)

    # 2) priority pool: PSA-graded sales for cards with analytics rows
    ana = sb.table("analytics_daily").select("card_id").execute().data or []
    priority_card_ids = list({r["card_id"] for r in ana})

    out: list[tuple[str, str]] = []

    def harvest_from(rows: list[dict]):
        for r in rows:
            t = r.get("external_title") or ""
            for m in CERT_RE.findall(t):
                if int(m) > 2099 and m not in seen:
                    seen.add(m)
                    out.append((m, r["card_id"]))
                    if len(out) >= limit:
                        return True
        return False

    # Pull priority sales in chunks of 200 card_ids (Supabase IN-list limit)
    for i in range(0, len(priority_card_ids), 200):
        chunk = priority_card_ids[i : i + 200]
        rows = (
            sb.table("sales")
            .select("card_id, external_title")
            .eq("is_graded", True)
            .eq("grader", "PSA")
            .in_("card_id", chunk)
            .limit(2000)
            .execute()
            .data
            or []
        )
        if harvest_from(rows):
            return out

    # 3) backfill from any remaining PSA-graded sales
    rows = (
        sb.table("sales")
        .select("card_id, external_title")
        .eq("is_graded", True)
        .eq("grader", "PSA")
        .limit(5000)
        .execute()
        .data
        or []
    )
    harvest_from(rows)
    return out


def _row_for_cert(cert: str, payload: dict, source_card_id: str | None, provenance: dict) -> dict:
    return {
        "cert_number": cert,
        "spec_id": payload.get("SpecID"),
        "spec_number": payload.get("SpecNumber"),
        "psa_year": payload.get("Year"),
        "psa_brand": payload.get("Brand"),
        "psa_category": payload.get("Category"),
        "psa_card_number": payload.get("CardNumber"),
        "psa_subject": payload.get("Subject"),
        "psa_variety": payload.get("Variety"),
        "grade_description": payload.get("GradeDescription"),
        "card_grade": payload.get("CardGrade"),
        "total_population": payload.get("TotalPopulation"),
        "total_population_with_qualifier": payload.get("TotalPopulationWithQualifier"),
        "population_higher": payload.get("PopulationHigher"),
        "card_id": source_card_id,
        "raw_payload": payload,
        **provenance,
    }


def _bump_pop_aggregate(spec_id: int, grade: str, total_pop: int, higher: int | None):
    """Upsert into psa_pop_by_spec. Increments cert_sample_count and
    refreshes the latest pop counts."""
    # PostgREST returns None for "no row" with maybe_single() — guard accordingly
    resp = (
        sb.table("psa_pop_by_spec")
        .select("cert_sample_count")
        .eq("spec_id", spec_id)
        .eq("grade", grade)
        .maybe_single()
        .execute()
    )
    existing = resp.data if resp else None
    sample = (existing.get("cert_sample_count") if existing else 0) + 1
    sb.table("psa_pop_by_spec").upsert(
        {
            "spec_id": spec_id,
            "grade": grade,
            "observed_pop": total_pop,
            "observed_higher": higher,
            "cert_sample_count": sample,
        },
        on_conflict="spec_id,grade",
    ).execute()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=80, help="hard cap (PSA free tier is 100/day)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--yes", action="store_true")
    args = ap.parse_args()

    used_today = call_count()
    remaining = DAILY_LIMIT - used_today
    if remaining <= 0:
        print(f"PSA daily limit reached ({used_today}/{DAILY_LIMIT}). Try again tomorrow.")
        return 1

    plan_n = min(args.max_calls, remaining)
    candidates = _candidate_certs(plan_n)
    print(f"PSA harvest plan:")
    print(f"  Daily limit:    {DAILY_LIMIT}")
    print(f"  Used today:     {used_today}")
    print(f"  Remaining:      {remaining}")
    print(f"  --max-calls:    {args.max_calls}")
    print(f"  Candidates:     {len(candidates)} new cert numbers")
    print(f"  Will fetch:     {min(plan_n, len(candidates))}")
    if candidates[:5]:
        print(f"  First 5:        {[c[0] for c in candidates[:5]]}")

    if args.dry_run or len(candidates) == 0:
        return 0

    if not args.yes:
        ans = input("\nProceed? [y/N] ")
        if ans.strip().lower() != "y":
            return 1

    with LoaderRun("psa_harvest.py", source="psa-public-api", params={"max_calls": args.max_calls}) as run:
        provenance = run.stamp()
        ok = 0
        miss = 0
        for cert, source_card_id in candidates[:plan_n]:
            data = lookup_cert(cert)
            run.add_api_calls(1)
            if not data:
                miss += 1
                continue
            row = _row_for_cert(cert, data, source_card_id, provenance)
            sb.table("psa_certs").upsert(row, on_conflict="cert_number").execute()
            run.add_rows_written(1)
            ok += 1
            # Bump aggregate
            spec = data.get("SpecID")
            grade = data.get("CardGrade")
            tp = data.get("TotalPopulation")
            ph = data.get("PopulationHigher")
            if spec and grade and tp is not None:
                _bump_pop_aggregate(int(spec), grade, int(tp), ph)

        print(f"\nDone. {ok} cert lookups stored, {miss} misses.")
        print(f"PSA calls today: {call_count()}/{DAILY_LIMIT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
