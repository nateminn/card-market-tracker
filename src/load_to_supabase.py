"""
load_to_supabase.py — load CardSight release JSON files into Supabase.

Walks data/release_*.json (or files passed on CLI) and upserts:
  segments -> manufacturers -> releases -> sets -> card_identity (base then parallels)

Idempotent: every insert is an upsert keyed on `id`. Safe to re-run.

Usage:
    .venv/bin/python src/load_to_supabase.py                         # load all data/release_*.json
    .venv/bin/python src/load_to_supabase.py data/release_xyz.json   # load just one file
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT / "src"))
from loader_run import LoaderRun  # noqa: E402

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Module-level provenance dict, set from main() once the LoaderRun starts.
# All upsert functions merge this into their rows so every row written by
# this script carries `loader_run_id` + `source_system`.
_RUN_PROVENANCE: dict = {}

# Pre-load segment names from exploration dump (segments.name is NOT NULL).
_seg_blob = json.loads((ROOT / "exploration" / "catalog_segments.json").read_text())
SEGMENT_INFO = {
    s["id"]: {"name": s["name"], "is_identifiable": s.get("is_identifiable", False)}
    for s in _seg_blob["data"]["segments"]
}


def upsert_segment(segment_id):
    info = SEGMENT_INFO.get(segment_id, {"name": "<unknown>", "is_identifiable": False})
    client.table("segments").upsert(
        {
            "id": segment_id,
            "name": info["name"],
            "is_identifiable": info["is_identifiable"],
            **_RUN_PROVENANCE,
        },
        on_conflict="id",
    ).execute()


def upsert_manufacturer(manufacturer_id):
    if not manufacturer_id:
        return
    # ignore_duplicates so we don't overwrite a real name (if backfilled later) with '<unknown>'
    client.table("manufacturers").upsert(
        {"id": manufacturer_id, "name": "<unknown>", **_RUN_PROVENANCE},
        on_conflict="id",
        ignore_duplicates=True,
    ).execute()


def upsert_release(release):
    client.table("releases").upsert(
        {
            "id": release["id"],
            "segment_id": release["segmentId"],
            "manufacturer_id": release.get("manufacturerId"),
            "year": release.get("year") or "?",
            "name": release.get("name") or "?",
            "is_identifiable": release.get("is_identifiable", False),
            **_RUN_PROVENANCE,
        },
        on_conflict="id",
    ).execute()


def upsert_sets(release_id, sets):
    rows = [
        {
            "id": s["id"],
            "release_id": release_id,
            "name": s["name"],
            "is_identifiable": s.get("is_identifiable", False),
            **_RUN_PROVENANCE,
        }
        for s in sets
    ]
    _chunked_upsert("sets", rows)


def base_card_rows(cards):
    out = []
    for c in cards:
        attrs = c.get("attributes") or []
        out.append(
            {
                "id": c["id"],
                "set_id": c["setId"],
                "release_id": c["releaseId"],
                "parent_card_id": None,
                "card_number": c.get("number"),
                "player_name": c.get("name") or "?",
                "parallel_name": None,
                "numbered_to": None,
                "is_rookie": "RC" in attrs,
                "is_autograph": False,  # derived later from set/parallel name heuristics
                "is_relic": False,
                "attributes": attrs,
                **_RUN_PROVENANCE,
            }
        )
    return out


def parallel_type_rows(cards, release_id):
    """CardSight inline parallel UUIDs are TYPE UUIDs scoped to a set.
    Each unique UUID appears once in parallel_types (first set we see it under)."""
    seen = {}
    for c in cards:
        for p in c.get("parallels") or []:
            pid = p["id"]
            if pid in seen:
                continue
            seen[pid] = {
                "id": pid,
                "set_id": c["setId"],
                "release_id": release_id,
                "name": p.get("name") or "?",
                "numbered_to": p.get("numberedTo"),
                "is_autograph": False,
                "is_relic": False,
                **_RUN_PROVENANCE,
            }
    return list(seen.values())


def _chunked_upsert(table, rows, chunk=500):
    # Dedupe by id: CardSight occasionally returns the same row twice (e.g. Bowman Chrome
    # had Junior Caminero base #56 listed twice). Postgres rejects duplicates in a single upsert.
    deduped = list({r["id"]: r for r in rows}.values())
    for i in range(0, len(deduped), chunk):
        client.table(table).upsert(deduped[i : i + chunk], on_conflict="id").execute()


def load_file(path):
    print(f"\nLoading {path.name}")
    data = json.loads(path.read_text())
    release = data["release"]
    cards = data["cards"]

    n_base = len(cards)
    par_types = parallel_type_rows(cards, release["id"])
    print(f"  Release: {release.get('year')} {release.get('name')}  id={release['id']}")
    print(f"  {n_base} base cards, {len(par_types)} unique parallel types")

    upsert_segment(release["segmentId"])
    upsert_manufacturer(release.get("manufacturerId"))
    upsert_release(release)
    upsert_sets(release["id"], release.get("sets") or [])

    print(f"  Inserting base cards...")
    _chunked_upsert("card_identity", base_card_rows(cards))
    print(f"  Inserting parallel types...")
    _chunked_upsert("parallel_types", par_types)
    print(f"  -> done.")


def main():
    args = sys.argv[1:]
    if args:
        files = [Path(a) for a in args]
    else:
        files = sorted(
            f for f in (ROOT / "data").glob("release_*.json") if "_summary" not in f.name
        )
    if not files:
        sys.exit("No release JSON files found in data/.")

    with LoaderRun(
        "load_to_supabase.py",
        source="cardsight",
        params={"files": [f.name for f in files]},
        notes="Catalog load (releases / sets / card_identity / parallel_types).",
    ) as run:
        # Push provenance into the module-level dict so every nested upsert
        # (segment / manufacturer / release / set / card / parallel) merges
        # `loader_run_id` and `source_system` into its rows.
        global _RUN_PROVENANCE
        _RUN_PROVENANCE = run.stamp()

        for f in files:
            load_file(f)

    print("\n=== Supabase totals ===")
    for tbl in ("segments", "manufacturers", "releases", "sets", "card_identity", "parallel_types"):
        n = client.table(tbl).select("id", count="exact").limit(1).execute().count
        print(f"  {tbl:15s} {n}")


if __name__ == "__main__":
    main()
