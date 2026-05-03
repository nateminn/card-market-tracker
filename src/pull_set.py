"""Pull every card in a CardSight release, save to data/{release_id}.json, print a summary.

Usage:
    python src/pull_set.py <release_id>
    python src/pull_set.py                 # defaults to 2024 Topps Chrome Baseball

Counts each API call into exploration/_call_count.txt so we stay under the 750/mo cap.
"""
from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")
KEY = os.environ["CARDSIGHT_API_KEY"]
BASE = "https://api.cardsight.ai/v1"
HEADERS = {"X-API-Key": KEY, "Accept": "application/json"}
COUNTER = ROOT / "exploration" / "_call_count.txt"

DEFAULT_RELEASE = "91e66c48-701c-4565-953c-14e91d8f5030"  # 2024 Topps Chrome (984 cards)
PAGE_SIZE = 100  # CardSight max


def _bump_counter():
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    n += 1
    COUNTER.write_text(str(n))
    return n


def fetch_release_meta(release_id: str) -> dict:
    n = _bump_counter()
    r = requests.get(f"{BASE}/catalog/releases/{release_id}", headers=HEADERS, timeout=30)
    r.raise_for_status()
    print(f"  [call #{n}] release meta")
    return r.json()


def fetch_release_cards(release_id: str) -> list[dict]:
    """Paginate through all cards in a release."""
    all_cards: list[dict] = []
    skip = 0
    total = None
    while True:
        n = _bump_counter()
        r = requests.get(
            f"{BASE}/catalog/releases/{release_id}/cards",
            headers=HEADERS,
            params={"skip": skip, "take": PAGE_SIZE},
            timeout=30,
        )
        r.raise_for_status()
        body = r.json()
        cards = body.get("cards", [])
        total = body.get("total_count", total)
        all_cards.extend(cards)
        print(f"  [call #{n}] page skip={skip} got={len(cards)} of {total}")
        if not cards or len(all_cards) >= (total or 0):
            break
        skip += PAGE_SIZE
        time.sleep(0.2)  # be polite
    return all_cards


def summarise(release_meta: dict, cards: list[dict]) -> dict:
    """Build a summary dict. Variants here = the parallels NESTED inside each card."""
    base_count = len(cards)
    parallel_count = sum(len(c.get("parallels", [])) for c in cards)
    players = Counter(c.get("name", "?") for c in cards)
    parallel_names = Counter()
    for c in cards:
        for p in c.get("parallels", []):
            parallel_names[p.get("name", "?")] += 1
    sets_in_release = Counter(c.get("setName", "?") for c in cards)
    rookies = sum(1 for c in cards if "RC" in (c.get("attributes") or []))
    numbered = sum(
        1 for c in cards for p in c.get("parallels", []) if p.get("numberedTo") is not None
    )

    return {
        "release": {
            "id": release_meta.get("id"),
            "year": release_meta.get("year"),
            "name": release_meta.get("name"),
        },
        "totals": {
            "base_cards": base_count,
            "parallels_listed_inline": parallel_count,
            "total_unique_records": base_count + parallel_count,
            "rookie_base_cards": rookies,
            "parallels_with_print_run": numbered,
            "sets_in_release": len(sets_in_release),
            "unique_players": len(players),
        },
        "top_players": players.most_common(10),
        "top_parallel_types": parallel_names.most_common(15),
        "sets_in_release": sets_in_release.most_common(),
    }


def main():
    release_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RELEASE
    print(f"Pulling release {release_id}\n")

    meta = fetch_release_meta(release_id)
    print(f"\n  -> {meta.get('year')} {meta.get('name')}\n")

    cards = fetch_release_cards(release_id)

    out_dir = ROOT / "data"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / f"release_{release_id}.json"
    with open(out_path, "w") as f:
        json.dump({"release": meta, "cards": cards}, f, indent=2)
    print(f"\nSaved {len(cards)} cards to {out_path.relative_to(ROOT)}")

    summary = summarise(meta, cards)
    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2, default=str))

    summary_path = out_dir / f"release_{release_id}_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nSummary written to {summary_path.relative_to(ROOT)}")
    print(f"Total CardSight calls used (cumulative): {COUNTER.read_text().strip()}")


if __name__ == "__main__":
    main()
