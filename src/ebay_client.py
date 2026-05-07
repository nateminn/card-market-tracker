"""eBay Browse API client.

Wraps the OAuth2 application-token flow + the search/item endpoints
we'll actually use. Production-only (no sandbox) since our use case is
real listing data.

Credentials needed (in .env):
  EBAY_CLIENT_ID      App ID from developer.ebay.com keysets page
  EBAY_CLIENT_SECRET  Cert ID from same page

Get them by:
  1. https://developer.ebay.com/my/keys
  2. Sign in with your eBay account
  3. "Get a key set" → fill out the application form (it's automated, NOT
     a partnership ask)
  4. Copy the Production App ID + Cert ID into .env

Once those are set, this module:
  - obtains an OAuth2 token via client_credentials grant (cached + refreshed)
  - exposes search_items() and get_item() backed by the Browse API
  - tracks call count locally so we can stay under the 5K/day production cap

Reference: /Users/nathan/Downloads/buy_browse_v1_oas3.json
Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
"""

from __future__ import annotations

import base64
import os
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
COUNTER = ROOT / "exploration" / "_ebay_call_count.txt"

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
BASE_URL = "https://api.ebay.com/buy/browse/v1"
SCOPE = "https://api.ebay.com/oauth/api_scope"

# eBay Browse production limit: 5,000 calls/day per app (default).
DAILY_LIMIT = 5000

_token_cache: dict = {"access_token": None, "expires_at": 0}


def _bump_counter() -> int:
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    n += 1
    COUNTER.write_text(str(n))
    return n


def call_count() -> int:
    if COUNTER.exists():
        return int(COUNTER.read_text().strip() or 0)
    return 0


def get_token() -> str:
    """Fetch (or return cached) application-only OAuth token. Tokens last
    7,200 seconds; we refresh 60s before expiry."""
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expires_at"] - 60 > now:
        return _token_cache["access_token"]

    cid = os.environ.get("EBAY_CLIENT_ID")
    secret = os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not secret:
        raise RuntimeError(
            "Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET. Get them from "
            "https://developer.ebay.com/my/keys and add to .env."
        )

    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = requests.post(
        OAUTH_URL,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {auth}",
        },
        data={"grant_type": "client_credentials", "scope": SCOPE},
        timeout=20,
    )
    r.raise_for_status()
    body = r.json()
    _token_cache["access_token"] = body["access_token"]
    _token_cache["expires_at"] = now + int(body.get("expires_in", 7200))
    return body["access_token"]


def _headers(marketplace: str = "EBAY_US") -> dict:
    return {
        "Authorization": f"Bearer {get_token()}",
        "X-EBAY-C-MARKETPLACE-ID": marketplace,
        "Accept": "application/json",
    }


def search_items(
    *,
    q: str | None = None,
    category_ids: str | None = None,
    epid: str | None = None,
    gtin: str | None = None,
    filter_str: str | None = None,
    sort: str | None = None,
    limit: int = 50,
    offset: int = 0,
    fieldgroups: str = "MATCHING_ITEMS",
    marketplace: str = "EBAY_US",
) -> dict:
    """Browse API /item_summary/search.

    For trading-card listings we typically use:
        q="2024 Bowman Chrome Paul Skenes RC #31"
        category_ids="261328"  # Sports Trading Cards
        filter=buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:US
    """
    _bump_counter()
    params = {
        k: v for k, v in {
            "q": q,
            "category_ids": category_ids,
            "epid": epid,
            "gtin": gtin,
            "filter": filter_str,
            "sort": sort,
            "limit": limit,
            "offset": offset,
            "fieldgroups": fieldgroups,
        }.items() if v is not None
    }
    r = requests.get(
        f"{BASE_URL}/item_summary/search",
        headers=_headers(marketplace),
        params=params,
        timeout=30,
    )
    if r.status_code != 200:
        return {"_status": r.status_code, "_error": r.text[:500]}
    return r.json()


def get_item(item_id: str, *, marketplace: str = "EBAY_US") -> dict:
    """Browse API /item/{item_id} - full detail for a single listing."""
    _bump_counter()
    r = requests.get(
        f"{BASE_URL}/item/{item_id}",
        headers=_headers(marketplace),
        timeout=30,
    )
    if r.status_code != 200:
        return {"_status": r.status_code, "_error": r.text[:500]}
    return r.json()


# Useful eBay category IDs for sports cards
CATEGORY_SPORTS_TRADING_CARDS = "261328"  # broad
CATEGORY_BASEBALL_CARDS = "213"
CATEGORY_BASKETBALL_CARDS = "215"
CATEGORY_FOOTBALL_CARDS = "215"  # actually 215 is multi - check eBay
