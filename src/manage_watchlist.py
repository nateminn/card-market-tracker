"""
manage_watchlist.py — add / remove / list cards on the Cardex watchlist.

Searches `card_identity` in Supabase by player name (and optional release/set
filters) and writes selections to the `watchlist` table. Watchlist is keyed on
`card_id` (CardSight base-card UUID), so adding the same card twice is a no-op.

Usage:
    .venv/bin/python src/manage_watchlist.py list
    .venv/bin/python src/manage_watchlist.py add "Caleb Williams"
    .venv/bin/python src/manage_watchlist.py add "Trout" --release "Topps Chrome" --year 2024
    .venv/bin/python src/manage_watchlist.py remove <card_id>

Notes:
- Only base cards live in `card_identity`; parallels are tracked in `parallel_types`
  and not watchable by themselves (yet — see CLAUDE.md schema notes).
- Grade tracking (PSA 10 vs PSA 9 etc.) happens at analytics time; the watchlist
  just records "I care about this card", and pricing refresh pulls every grade.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def _release_set_lookup(card_ids: list[str]) -> dict:
    """Fetch release name + set name for a batch of card_ids in one round-trip."""
    if not card_ids:
        return {}
    rows = (
        client.table("card_identity")
        .select("id, release_id, set_id, releases(year, name), sets(name)")
        .in_("id", card_ids)
        .execute()
    )
    out = {}
    for r in rows.data or []:
        rel = r.get("releases") or {}
        st = r.get("sets") or {}
        out[r["id"]] = {
            "release_year": rel.get("year"),
            "release_name": rel.get("name"),
            "set_name": st.get("name"),
        }
    return out


def cmd_list(_):
    watch = client.table("watchlist").select("*").order("added_at").execute().data or []
    if not watch:
        print("Watchlist is empty.")
        return
    info = _release_set_lookup([w["card_id"] for w in watch])
    cards = (
        client.table("card_identity")
        .select("id, player_name, card_number, is_rookie")
        .in_("id", [w["card_id"] for w in watch])
        .execute()
        .data
        or []
    )
    cards_by_id = {c["id"]: c for c in cards}
    print(f"\n{len(watch)} card(s) on watchlist:")
    print(f"  {'card_id (short)':16}  {'year':6}  {'release/set':38}  {'#':6}  {'player':24}  {'rc':>3}  {'buy/sell tgts':14}")
    for w in watch:
        cid = w["card_id"]
        c = cards_by_id.get(cid, {})
        i = info.get(cid, {})
        rs = f"{i.get('release_name','?')} / {i.get('set_name','?')}"[:38]
        tgt = ""
        if w.get("target_buy_usd") or w.get("target_sell_usd"):
            tgt = f"{w.get('target_buy_usd') or '-'}/{w.get('target_sell_usd') or '-'}"
        print(
            f"  {cid[:8]}..        "
            f"  {i.get('release_year','-'):<6}"
            f"  {rs:38}"
            f"  {c.get('card_number','-'):<6}"
            f"  {(c.get('player_name','?'))[:24]:24}"
            f"  {'Y' if c.get('is_rookie') else '-':>3}"
            f"  {tgt:14}"
        )


def cmd_add(args):
    q = args.query
    print(f"Searching card_identity for player_name LIKE '%{q}%'...")
    sel = (
        client.table("card_identity")
        .select("id, player_name, card_number, is_rookie, release_id, set_id, releases(year, name), sets(name)")
        .ilike("player_name", f"%{q}%")
    )
    if args.year:
        rels = client.table("releases").select("id").eq("year", args.year).execute().data or []
        ids = [r["id"] for r in rels]
        if not ids:
            sys.exit(f"No releases found with year={args.year}")
        sel = sel.in_("release_id", ids)
    if args.release:
        rels = (
            client.table("releases")
            .select("id")
            .ilike("name", f"%{args.release}%")
            .execute()
            .data
            or []
        )
        ids = [r["id"] for r in rels]
        if not ids:
            sys.exit(f"No releases found with name LIKE %{args.release}%")
        sel = sel.in_("release_id", ids)

    rows = sel.limit(50).execute().data or []
    if not rows:
        sys.exit(f"No matches for '{q}'.")

    print(f"\nGot {len(rows)} match(es) (showing up to 50):")
    print(f"  {'#':>3}  {'year':6}  {'release / set':40}  {'card#':8}  {'player':24}  {'rc':>3}")
    for i, r in enumerate(rows):
        rel = r.get("releases") or {}
        st = r.get("sets") or {}
        rs = f"{rel.get('name','?')} / {st.get('name','?')}"[:40]
        print(
            f"  {i+1:>3}  {rel.get('year','-'):<6}  "
            f"{rs:40}  {(r.get('card_number') or '-'):<8}  "
            f"{(r.get('player_name','?'))[:24]:24}  "
            f"{'Y' if r.get('is_rookie') else '-':>3}"
        )

    raw = input("\nPick number(s) to add (comma-separated, or 'q'): ").strip()
    if raw.lower() == "q" or not raw:
        print("Cancelled.")
        return
    try:
        picks = [int(x.strip()) for x in raw.split(",") if x.strip()]
    except ValueError:
        sys.exit("Invalid selection.")

    added = 0
    for p in picks:
        if not (1 <= p <= len(rows)):
            print(f"  skipped {p} (out of range)")
            continue
        card = rows[p - 1]
        try:
            client.table("watchlist").insert(
                {"card_id": card["id"], "notes": args.notes}
            ).execute()
            print(f"  added {card['id'][:8]}.. {card['player_name']}")
            added += 1
        except Exception as e:
            msg = str(e)
            if "duplicate" in msg or "23505" in msg:
                print(f"  already on watchlist: {card['id'][:8]}.. {card['player_name']}")
            else:
                print(f"  error adding {card['id']}: {e}")
    print(f"\nAdded {added} card(s).")


def cmd_remove(args):
    cid = args.card_id
    res = client.table("watchlist").delete().eq("card_id", cid).execute()
    if res.data:
        print(f"Removed {cid}.")
    else:
        print(f"No watchlist entry for {cid}.")


def main():
    p = argparse.ArgumentParser(description="Cardex watchlist manager")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("list", help="List all watchlist cards")
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("add", help="Search card_identity and add to watchlist")
    sp.add_argument("query", help="Player name substring")
    sp.add_argument("--year", help="Filter by release year (e.g. 2024)")
    sp.add_argument("--release", help="Filter by release name substring (e.g. 'Topps Chrome')")
    sp.add_argument("--notes", default=None, help="Optional notes")
    sp.set_defaults(func=cmd_add)

    sp = sub.add_parser("remove", help="Remove a card from watchlist by id")
    sp.add_argument("card_id", help="UUID of the card to remove")
    sp.set_defaults(func=cmd_remove)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
