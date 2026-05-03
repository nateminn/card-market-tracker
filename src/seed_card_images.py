"""One-shot: pull pricing for a curated list of star-player cards.

Two outputs:
  1) Sales rows land in Supabase (refresh_watchlist_prices.py logic, inlined).
     This means populate_card_images.py will then have material to work with.
  2) web/lib/card_images.json — a {card_id: image_url} lookup the web mock
     reads at build time to render real eBay thumbnails in the demo UI.

The point is to get the visual product showing real images NOW for the
handful of players the user interacts with most, while also exercising the
production data pipeline end-to-end.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

from loader_run import LoaderRun

load_dotenv(Path(__file__).parent.parent / ".env")

CARDSIGHT_KEY = os.environ["CARDSIGHT_API_KEY"]
BASE = "https://api.cardsight.ai/v1"
HEADERS = {"X-API-Key": CARDSIGHT_KEY, "Accept": "application/json"}
EXP = Path(__file__).parent.parent / "exploration"
COUNTER = EXP / "_call_count.txt"
WEB_LIB = Path(__file__).parent.parent / "web" / "lib"


# Curated set: VERIFIED base-RC UUIDs for our mock players. Each was checked
# against card_identity for: parent_card_id IS NULL (base, not parallel),
# release_id IS in our 6 loaded releases, prefer is_rookie=true, prefer
# numeric card_number (filters out auto/insert variants).
#
# Updated 2026-04-27: previous list had several insert-card UUIDs (e.g. the
# old "Paul Skenes" entry was a 1999 Bowman Chrome 25th Anniversary insert,
# not the 2024 RC). Re-derived via heuristic; see Phase 1 audit notes.
SEEDS: dict[str, str] = {
    # Mike Trout 2011 Topps Update — known UUID from CLAUDE.md (release not
    # loaded into card_identity, so sales upserts will FK-violate but the
    # script extracts the image URL anyway, which is the point).
    "Mike Trout": "fda530ab-e925-460e-ab88-63199ef975e9",
    # 2024 Bowman Chrome Baseball RCs:
    "Paul Skenes": "563126b6-e6df-4692-bdc3-ba2b1e0b4538",        # #31 RC
    "Gunnar Henderson": "0b2cfa5f-4203-456d-919c-cc3ded83e4b9",   # #9
    "Jackson Holliday": "a9918d39-c69a-4f3d-8e02-74fef95abd24",   # #26
    "Wyatt Langford": "43266387-7361-4f7d-8cc0-2cf5f2ce1e0d",     # #71
    "Junior Caminero": "ed356c23-ecd5-441b-9bcd-c333f8fd3de7",    # #56
    # 2024 Topps Chrome Baseball RCs:
    "Yoshinobu Yamamoto": "e324a79c-0287-4b94-8df3-c55046e696be", # #18
    # 2024 Topps Chrome Football RCs:
    "Caleb Williams": "b65c0cc5-2bf4-405c-a503-66209ff47a2e",     # #202
    "Jayden Daniels": "a68fefbc-a3a0-434a-9a54-3fb8c560108a",     # #201
    "Marvin Harrison Jr": "33aa091b-fb47-427a-9fec-0c9dbefc725a", # #204
    "Brock Bowers": "f5c72523-92ed-4672-a28e-f6e4da973bfa",       # #207
    "Drake Maye": "47aec1ed-258a-4612-9d5e-7dea399f1ba5",         # #203
    # 2023-24 Panini Prizm Basketball RCs:
    "Victor Wembanyama": "ed6118ff-e631-4e5e-9c16-ac37f63fe59e",  # #1
    "Chet Holmgren": "1285a067-d5db-4a21-9369-c9250d20b6b7",      # #115
    "Brandon Miller": "24c51d2e-02af-41e8-b690-301215b44536",     # #2
    "Scoot Henderson": "64b4d018-5d98-405e-8b8e-e7da62debe9c",    # #3
}


def bump_counter() -> int:
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    COUNTER.write_text(str(n + 1))
    return n + 1


def cardsight_pricing(card_id: str) -> dict:
    n = bump_counter()
    r = requests.get(f"{BASE}/pricing/{card_id}", headers=HEADERS, timeout=30)
    print(f"  [call {n}] /pricing/{card_id[:8]}... → {r.status_code}")
    if r.status_code != 200:
        return {"_status": r.status_code}
    return r.json()


def extract_records(payload: dict) -> list[dict]:
    """Flatten raw.records[] + graded[].grades[].records[] into one list."""
    out: list[dict] = []
    data = payload.get("data", payload)
    raw = data.get("raw") or {}
    if isinstance(raw, dict):
        for rec in raw.get("records", []) or []:
            out.append({**rec, "_is_graded": False, "_grader": None, "_grade_value": None})
    for company in data.get("graded", []) or []:
        gname = company.get("company_name")
        for grade in company.get("grades", []) or []:
            for rec in grade.get("records", []) or []:
                out.append(
                    {
                        **rec,
                        "_is_graded": True,
                        "_grader": gname,
                        "_grade_value": grade.get("grade_value"),
                    }
                )
    return out


def insert_sales(
    sb,
    card_id: str,
    records: list[dict],
    provenance: dict | None = None,
) -> tuple[int, str | None]:
    """Best-effort idempotent insert via (card_id, external_id) unique constraint.

    Returns (rows_written, error_kind_or_none). error_kind 'fk' means the
    card_id isn't in card_identity (release not loaded yet) — caller decides
    whether to skip or warn. We never raise from here so the image-extraction
    pass continues regardless of DB state.

    `provenance` is merged into every row (loader_run_id, source_system).
    """
    provenance = provenance or {}
    if not records:
        return 0, None
    rows: list[dict] = []
    for r in records:
        sold_at = r.get("date")
        if not sold_at:
            continue
        ext_url = r.get("url")
        title = r.get("title") or ""
        ts = int(datetime.fromisoformat(sold_at.replace("Z", "+00:00")).timestamp())
        ext_id = ext_url or f"{title}|{ts}"
        rows.append(
            {
                "card_id": card_id,
                "sold_at": sold_at,
                "price_usd": r.get("price"),
                "is_graded": r["_is_graded"],
                "grader": r["_grader"],
                "grade_value": r["_grade_value"],
                "listing_type": r.get("listing_type"),
                "source": r.get("source", "ebay"),
                "external_url": ext_url,
                "external_title": title,
                "image_url": r.get("image_url"),
                "raw_payload": r,
                "external_id": ext_id,
                **provenance,
            }
        )
    written = 0
    chunk = 200
    for i in range(0, len(rows), chunk):
        sub = rows[i : i + chunk]
        try:
            sb.table("sales").upsert(sub, on_conflict="card_id,external_id").execute()
            written += len(sub)
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            if "sales_card_id_fkey" in msg:
                return written, "fk"
            return written, "other"
    return written, None


def pick_image(records: list[dict]) -> str | None:
    """Most recent sale wins; tie-break on highest price."""
    candidates = [
        r for r in records if r.get("image_url") and r.get("date")
    ]
    if not candidates:
        return None
    candidates.sort(
        key=lambda r: (r["date"], float(r.get("price") or 0)),
        reverse=True,
    )
    return candidates[0]["image_url"]


def main() -> int:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    summary: dict[str, dict] = {}
    saved_payloads: dict[str, str] = {}

    with LoaderRun(
        "seed_card_images.py",
        source="cardsight",
        params={"seeds": list(SEEDS.keys())},
        notes="Bulk-pull /pricing for curated star players to seed card images.",
    ) as run:
        provenance = run.stamp()

        for player, card_id in SEEDS.items():
            print(f"\n→ {player}  ({card_id[:8]}...)")
            payload = cardsight_pricing(card_id)
            run.add_api_calls(1)
            if payload.get("_status") and payload["_status"] != 200:
                print(f"  skipped (status {payload['_status']})")
                summary[player] = {"card_id": card_id, "image_url": None, "sales": 0}
                continue

            # Save the raw response for audit so we don't redo this call.
            slug = player.lower().replace(" ", "_")
            out_path = EXP / f"pricing_{slug}.json"
            out_path.write_text(json.dumps(payload, indent=2))
            saved_payloads[player] = str(out_path)

            records = extract_records(payload)
            run.add_rows_read(len(records))
            print(f"  {len(records)} sale records returned")

            # Push to Supabase (idempotent, best-effort — keep going on FK fail).
            if records:
                wrote, err = insert_sales(sb, card_id, records, provenance=provenance)
                run.add_rows_written(wrote)
                if err == "fk":
                    print(
                        f"  upserted {wrote}/{len(records)} sales rows · "
                        f"FK violation (release not loaded into card_identity); "
                        f"image still extracted"
                    )
                elif err:
                    print(f"  upserted {wrote}/{len(records)} sales rows · DB error")
                else:
                    print(f"  upserted {wrote} sales rows")

            img = pick_image(records)
            summary[player] = {
                "card_id": card_id,
                "image_url": img,
                "sales": len(records),
            }
            if img:
                print(f"  picked image: {img}")
            else:
                print("  no image found in any record")

            time.sleep(0.5)  # be polite to CardSight

    # Write the web-side lookup. Keys are PLAYER NAMES (the mock-data join key).
    WEB_LIB.mkdir(parents=True, exist_ok=True)
    out = WEB_LIB / "card_images.json"
    payload = {
        "_generated_at": datetime.now(timezone.utc).isoformat(),
        "_note": (
            "Player name → eBay thumbnail URL. Sourced from CardSight "
            "/pricing/{card_id} most-recent sale. Regenerate with "
            "`python src/seed_card_images.py`."
        ),
        "by_player": {
            player: info["image_url"]
            for player, info in summary.items()
            if info["image_url"]
        },
    }
    out.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {out} ({len(payload['by_player'])} players)")

    print("\nSummary:")
    for player, info in summary.items():
        mark = "✓" if info["image_url"] else "—"
        print(f"  {mark} {player:25s}  sales={info['sales']:>4}  img={info['image_url'] or '(none)'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
