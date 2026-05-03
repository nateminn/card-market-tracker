"""
test_supabase.py — verifies the Cardex Supabase connection end-to-end.

Inserts a row through the FK chain (segment -> release -> set -> card_identity),
reads it back, then cleans up in reverse order. Idempotent: uses fixed test
UUIDs and clears them at the start, so a failed previous run won't block this one.

Run from project root:
    .venv/bin/python src/test_supabase.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_KEY")

if not URL or not KEY:
    sys.exit("ERROR: SUPABASE_URL or SUPABASE_KEY missing from .env")

# Fixed test UUIDs — easy to clean up if a run dies mid-way
TEST_SEGMENT = "00000000-0000-0000-0000-000000000001"
TEST_RELEASE = "00000000-0000-0000-0000-000000000002"
TEST_SET     = "00000000-0000-0000-0000-000000000003"
TEST_CARD    = "00000000-0000-0000-0000-000000000004"

client = create_client(URL, KEY)
print(f"Connected to {URL}")

# --- 1. clean any leftovers from a previous failed run -----------------------
print("Step 1/4: clearing leftovers (if any)...")
for table, _id in [
    ("card_identity", TEST_CARD),
    ("sets",          TEST_SET),
    ("releases",      TEST_RELEASE),
    ("segments",      TEST_SEGMENT),
]:
    client.table(table).delete().eq("id", _id).execute()

# --- 2. insert through the FK chain ------------------------------------------
print("Step 2/4: inserting test rows (segment -> release -> set -> card)...")
client.table("segments").insert({
    "id": TEST_SEGMENT, "name": "TEST_SEGMENT", "is_identifiable": False,
}).execute()
client.table("releases").insert({
    "id": TEST_RELEASE, "segment_id": TEST_SEGMENT, "year": "TEST", "name": "TEST_RELEASE",
}).execute()
client.table("sets").insert({
    "id": TEST_SET, "release_id": TEST_RELEASE, "name": "TEST_SET",
}).execute()
client.table("card_identity").insert({
    "id": TEST_CARD,
    "set_id": TEST_SET,
    "release_id": TEST_RELEASE,
    "player_name": "TEST_PLAYER",
    "is_rookie": True,
}).execute()

# --- 3. read it back ---------------------------------------------------------
print("Step 3/4: reading the card back...")
res = client.table("card_identity").select("*").eq("id", TEST_CARD).execute()
if not res.data:
    sys.exit("ERROR: read-back returned no rows. RLS blocking, or insert failed silently.")
row = res.data[0]
assert row["player_name"] == "TEST_PLAYER", f"unexpected: {row}"
assert row["is_rookie"] is True, f"unexpected: {row}"
print(f"  -> id={row['id']}, player_name={row['player_name']}, is_rookie={row['is_rookie']}")

# --- 4. cleanup --------------------------------------------------------------
print("Step 4/4: cleaning up test rows...")
for table, _id in [
    ("card_identity", TEST_CARD),
    ("sets",          TEST_SET),
    ("releases",      TEST_RELEASE),
    ("segments",      TEST_SEGMENT),
]:
    client.table(table).delete().eq("id", _id).execute()

# verify cleanup actually removed the card
remaining = client.table("card_identity").select("id").eq("id", TEST_CARD).execute()
if remaining.data:
    sys.exit("ERROR: cleanup did not remove the card row.")

print("\nAll checks passed. Supabase connection works (insert / read / delete).")
