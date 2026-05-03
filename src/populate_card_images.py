"""Populate card_identity.image_url from sales.image_url.

CardSight doesn't return images on /catalog/cards/{id} — they only appear on
individual sale records inside /pricing/{card_id}. So the catalog row is
imageless until we've pulled at least one priced sale.

This script picks one canonical thumbnail per card and stashes it on
card_identity so the UI doesn't have to join sales every render.

Selection heuristic (per card_id):
  1. Most recent sale with image_url
  2. Tie-break: highest-priced (proxies for "real listing", not bargain bin)

Idempotent. Safe to re-run after every pricing refresh.

Prereq: migration 001_card_identity_image_url.sql must be applied
(adds image_url, image_source, image_set_at columns).
"""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client

from loader_run import LoaderRun


def main() -> int:
    load_dotenv()
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

    # Pre-flight: confirm the migration ran.
    try:
        sb.table("card_identity").select("id, image_url").limit(1).execute()
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "image_url" in msg and "does not exist" in msg:
            print(
                "ERROR: card_identity.image_url column missing.\n"
                "Apply src/migrations/001_card_identity_image_url.sql in the\n"
                "Supabase SQL Editor before running this script."
            )
            return 2
        raise

    return _run(sb)


def _run(sb) -> int:
    with LoaderRun(
        "populate_card_images.py",
        source="derived",
        notes="Pick best sale image per card_id; update card_identity.image_url.",
    ) as run:
        return _do_populate(sb, run)


def _do_populate(sb, run) -> int:
    # The original logic, indented one level so it lives inside the LoaderRun.

    # 1) Pull every sale that has an image_url, newest first.
    #    Pagination: PostgREST default range is 1000; loop until empty.
    print("Reading sales with image_url...")
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        r = (
            sb.table("sales")
            .select("card_id, sold_at, price_usd, image_url")
            .not_.is_("image_url", "null")
            .order("sold_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not r.data:
            break
        rows.extend(r.data)
        if len(r.data) < page_size:
            break
        offset += page_size
    print(f"  read {len(rows)} sales with images")
    run.add_rows_read(len(rows))

    # 2) Pick the best image per card_id.
    by_card: dict[str, dict] = {}
    for s in rows:
        cid = s["card_id"]
        if cid not in by_card:
            by_card[cid] = s
            continue
        # Tie-break on price when sold_at is identical.
        cur = by_card[cid]
        if s["sold_at"] > cur["sold_at"]:
            by_card[cid] = s
        elif s["sold_at"] == cur["sold_at"]:
            sp = float(s["price_usd"]) if s["price_usd"] is not None else 0
            cp = float(cur["price_usd"]) if cur["price_usd"] is not None else 0
            if sp > cp:
                by_card[cid] = s

    print(f"  resolved {len(by_card)} distinct cards with a chosen image")

    # 3) Skip cards whose image hasn't changed (cuts write churn).
    print("Reading current card_identity.image_url for diffing...")
    existing: dict[str, str | None] = {}
    ids = list(by_card.keys())
    chunk = 500
    for i in range(0, len(ids), chunk):
        sub = ids[i : i + chunk]
        r = (
            sb.table("card_identity")
            .select("id, image_url")
            .in_("id", sub)
            .execute()
        )
        for row in r.data:
            existing[row["id"]] = row["image_url"]

    to_write: list[dict] = []
    unchanged = 0
    provenance = run.stamp() if run else {}
    for cid, s in by_card.items():
        if existing.get(cid) == s["image_url"]:
            unchanged += 1
            continue
        to_write.append(
            {
                "id": cid,
                "image_url": s["image_url"],
                "image_source": "sales",
                "image_set_at": datetime.now(timezone.utc).isoformat(),
                **provenance,
            }
        )

    print(f"  unchanged: {unchanged} · to write: {len(to_write)}")

    # 4) UPDATE in place. We can't UPSERT because card_identity has NOT NULL
    #    columns we wouldn't be providing (set_id, release_id, etc.) and the
    #    Supabase Python client's upsert tries an INSERT path first. Plain
    #    UPDATE is also more honest: we're amending existing catalog rows,
    #    not inserting new ones.
    if to_write:
        written = 0
        skipped = 0
        for row in to_write:
            cid = row["id"]
            payload = {k: v for k, v in row.items() if k != "id"}
            r = (
                sb.table("card_identity")
                .update(payload)
                .eq("id", cid)
                .execute()
            )
            if r.data:
                written += 1
            else:
                skipped += 1  # UUID isn't in card_identity (release not loaded)
        run.add_rows_written(written)
        print(f"  updated {written}/{len(to_write)}  ·  skipped {skipped} (UUID not in catalog)")

    # 5) Final coverage report.
    total = sb.table("card_identity").select("id", count="exact").limit(1).execute().count
    with_img = (
        sb.table("card_identity")
        .select("id", count="exact")
        .not_.is_("image_url", "null")
        .limit(1)
        .execute()
        .count
    )
    pct = (with_img / total * 100) if total else 0
    print(
        f"\nDone. Coverage: {with_img}/{total} cards have an image "
        f"({pct:.1f}%)."
    )
    if pct < 5:
        print(
            "Tip: most cards still lack images because we've only refreshed\n"
            "pricing for a handful of cards. Run refresh_watchlist_prices.py\n"
            "after adding more cards to the watchlist."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
