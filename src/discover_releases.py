"""Discover and rank candidate releases to bulk-load next.

Reads cached release listings from `exploration/releases_<year>.json`
(written by `_client.call`) and ranks unloaded releases by collector
demand: brand prestige × year recency × identifiability.

Output: a ranked candidate list with per-release call estimates so the
next bulk-load is a deliberate decision instead of a guess.

Usage:
    python src/discover_releases.py                  # print ranked list
    python src/discover_releases.py --json           # emit JSON
    python src/discover_releases.py --top 20         # only the top 20

To refresh the source data first, the loader_release calls go via
exploration/_client.py; see seed_releases() helper below if you want
to pull fresh listings.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXP = ROOT / "exploration"

# Segment UUIDs we care about (Baseball, Basketball, Football). Others
# (TCG, soccer, etc.) get pruned because the catalog can't visually identify
# them (is_identifiable=false) and there's no clear monetization play yet.
PRIORITY_SEGMENTS: dict[str, str] = {
    "671e78da-64d2-45a4-8082-6682b2ae0e19": "Baseball",
    "ac331a5c-ee1e-43fb-a10c-e59d249be7b7": "Basketball",
    "5b86ca75-c5be-4621-aca1-57bd4f6dd111": "Football",
}

# Already-loaded releases (CLAUDE.md). Update this whenever new ones
# get loaded so subsequent discovery runs skip them.
LOADED: set[str] = {
    "91e66c48-701c-4565-953c-14e91d8f5030",  # 2024 Topps Chrome Football
    "7cacca84-42c3-4f03-9771-46cdc19fd52e",  # 2024 Topps Chrome Baseball
    "3395b970-2cb3-41ba-9eec-6512d4bb1720",  # 2023-24 Panini Prizm Basketball
    "f73c58f7-5a21-4c02-a062-79ee72523d87",  # 2024 Bowman Chrome Baseball
    "a77e19c1-4b49-49dc-844d-543a058bf9a1",  # 2024 Topps Series 1
    "9d723d19-bc1f-4e38-ae24-f8347fddd16d",  # 2024 Panini Prizm Football
}

# Brand prestige scoring. These numbers are intentionally rough — they
# reflect collector demand at the bulk level, not card-by-card pricing.
# Calibrate by checking eBay completed-sales volume for each brand × year.
BRAND_PRESTIGE: dict[str, int] = {
    # Tier 1 (chase brands — large RC-year demand, established secondary market)
    "Topps Chrome": 100,
    "Bowman Chrome": 100,
    "Panini Prizm": 100,
    "Topps Update": 95,        # RC-year baseball, very high demand
    "Bowman": 80,
    "Panini Select": 75,
    # Tier 2 (mainstream high-volume bases)
    "Topps": 60,
    "Topps Series 1": 60,
    "Topps Series 2": 60,
    "Donruss": 55,
    "Panini Mosaic": 55,
    "Topps Heritage": 50,
    # Tier 3 (specialty / lower-volume)
    "Stadium Club": 45,
    "Panini Optic": 50,
    "Panini Donruss Optic": 50,
    "Topps Allen Ginter": 35,
    "Topps Big League": 25,
    "Bowman's Best": 60,
    "Bowman Sterling": 50,
    "Bowman Platinum": 50,
    "Panini Contenders": 55,
    "Panini Immaculate": 65,    # high-end auto/relic
    "Panini National Treasures": 70,
    "Topps Definitive": 65,
    "Topps Triple Threads": 50,
    "Topps Tier One": 50,
}


def score_release(rel: dict) -> int:
    """Higher is better. Combine brand prestige, year recency, identifiability."""
    if not rel.get("is_identifiable", False):
        return -1  # cannot use; CardSight has no visual data

    brand = rel.get("name", "") or ""
    # Match against known prestige; default 30 for unknown brands.
    prestige = 30
    for known, score in BRAND_PRESTIGE.items():
        if known.lower() == brand.lower():
            prestige = score
            break
    else:
        # Substring match for prefixed names like "Topps Chrome Update"
        for known, score in BRAND_PRESTIGE.items():
            if known.lower() in brand.lower():
                prestige = max(prestige, score - 10)

    # Year recency: 2024 = +50, each year back = -10. Floor at 0.
    # Some years are split-season ("2023-24" for basketball/hockey) — take
    # the first 4 digits.
    year_raw = str(rel.get("year") or "2000")[:4]
    try:
        year = int(year_raw)
    except ValueError:
        year = 2000
    recency = max(0, 50 - (2024 - year) * 10)

    # Football & Basketball get a small bump because we're under-loaded
    # there relative to baseball.
    seg = rel.get("segmentId")
    seg_name = PRIORITY_SEGMENTS.get(seg)
    coverage_bump = {"Football": 5, "Basketball": 10}.get(seg_name or "", 0)

    return prestige + recency + coverage_bump


def estimate_calls(rel: dict) -> int:
    """Rough estimate: 1 call for release detail + N for cards pagination.
    CardSight returns up to 100 cards per page; most releases are ~1k cards
    so plan for 10 pages = 11 calls. Big releases (5k+ cards) need 50+ calls."""
    # We don't know card count without making a call, so guess by brand.
    big_brands = {"Topps", "Topps Series 1", "Topps Series 2", "Donruss"}
    medium_brands = {"Topps Chrome", "Bowman Chrome", "Panini Prizm", "Bowman"}
    name = rel.get("name", "")
    if name in big_brands:
        return 35  # ~3500 cards
    if name in medium_brands:
        return 11  # ~1000 cards
    return 6  # smaller / specialty


def load_release_files() -> list[dict]:
    out: list[dict] = []
    for f in sorted(EXP.glob("releases_*.json")):
        if "_summary" in f.name or "sample" in f.name or "search" in f.name or "topps_chrome" in f.name:
            continue
        try:
            blob = json.loads(f.read_text())
        except Exception:
            continue
        rels = blob.get("data", {}).get("releases", []) or []
        out.extend(rels)
    return out


def rank_releases() -> list[dict]:
    rels = load_release_files()
    candidates: list[dict] = []
    # Dedup by (year, name, segment) — CardSight returns the same release
    # name multiple times for sub-products. Keep the first instance and
    # collect all duplicate IDs so the user can audit if needed.
    seen: dict[tuple, dict] = {}
    for r in rels:
        if r.get("id") in LOADED:
            continue
        if r.get("segmentId") not in PRIORITY_SEGMENTS:
            continue
        score = score_release(r)
        if score < 0:
            continue
        key = (r.get("year"), (r.get("name") or "").strip(), r.get("segmentId"))
        if key in seen:
            seen[key]["dup_ids"].append(r["id"])
            continue
        seen[key] = {
            "id": r["id"],
            "year": r.get("year"),
            "name": r.get("name"),
            "segment": PRIORITY_SEGMENTS.get(r.get("segmentId"), "?"),
            "is_identifiable": r.get("is_identifiable"),
            "score": score,
            "estimated_calls": estimate_calls(r),
            "dup_ids": [],
        }
    candidates = list(seen.values())
    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--top", type=int, default=30)
    args = ap.parse_args()

    ranked = rank_releases()
    if not ranked:
        print(
            "No candidates found. Pull fresh listings first:\n"
            "  python -c 'import sys; sys.path.insert(0,\"exploration\"); "
            "from _client import call; "
            "[call(f\"/catalog/releases?year={y}&take=100\", save_as=f\"releases_{y}.json\") for y in (2024,2023,2022,2021,2020)]'"
        )
        return 1

    top = ranked[: args.top]
    if args.json:
        print(json.dumps(top, indent=2))
        return 0

    total_calls = sum(r["estimated_calls"] for r in top)
    print(f"Top {len(top)} candidate releases  (skipping {len(LOADED)} already loaded)")
    print(f"Total estimated CardSight calls: {total_calls}\n")
    print(f"  {'#':>2}  {'SCORE':>5}  {'YEAR':>4}  {'SEG':>10}  {'CALLS':>5}  NAME")
    print("  " + "─" * 70)
    for i, c in enumerate(top, 1):
        print(
            f"  {i:>2}  {c['score']:>5}  {c['year']:>4}  {c['segment']:>10}  "
            f"{c['estimated_calls']:>5}  {c['name']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
