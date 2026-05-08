"""eBay Browse API client.

Supports BOTH sandbox and production. Sandbox returns mock data and is
useful for verifying the OAuth + API wire protocol. Production returns
real listings and is what powers active_listings ingestion.

Switch via EBAY_ENV in .env:
  EBAY_ENV=sandbox     → uses EBAY_SANDBOX_CLIENT_ID / EBAY_SANDBOX_CLIENT_SECRET
  EBAY_ENV=production  → uses EBAY_PROD_CLIENT_ID / EBAY_PROD_CLIENT_SECRET

For backwards compat:
  EBAY_CLIENT_ID / EBAY_CLIENT_SECRET (no prefix) are also accepted and
  mapped to whichever env is selected.

Get keys at:
  https://developer.ebay.com/my/keys
  Sandbox keyset is instant; production keyset typically takes ~1 day.

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

# Environment URLs
ENVS = {
    "sandbox": {
        "oauth_url": "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
        "base_url": "https://api.sandbox.ebay.com/buy/browse/v1",
    },
    "production": {
        "oauth_url": "https://api.ebay.com/identity/v1/oauth2/token",
        "base_url": "https://api.ebay.com/buy/browse/v1",
    },
}
SCOPE = "https://api.ebay.com/oauth/api_scope"

# eBay Browse production limit: 5,000 calls/day per app (default).
# Sandbox has its own quota — also 5K/day, but data is fake.
DAILY_LIMIT = 5000


def _env() -> str:
    return os.environ.get("EBAY_ENV", "production").lower()


def _oauth_url() -> str:
    return ENVS[_env()]["oauth_url"]


def _base_url() -> str:
    return ENVS[_env()]["base_url"]


def _creds() -> tuple[str, str]:
    env = _env()
    if env == "sandbox":
        cid = os.environ.get("EBAY_SANDBOX_CLIENT_ID") or os.environ.get("EBAY_CLIENT_ID")
        sec = os.environ.get("EBAY_SANDBOX_CLIENT_SECRET") or os.environ.get("EBAY_CLIENT_SECRET")
    else:
        cid = os.environ.get("EBAY_PROD_CLIENT_ID") or os.environ.get("EBAY_CLIENT_ID")
        sec = os.environ.get("EBAY_PROD_CLIENT_SECRET") or os.environ.get("EBAY_CLIENT_SECRET")
    if not cid or not sec:
        raise RuntimeError(
            f"Missing eBay credentials for env={env}. Expected "
            f"EBAY_{'SANDBOX' if env == 'sandbox' else 'PROD'}_CLIENT_ID + _CLIENT_SECRET."
        )
    return cid, sec

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
    7,200 seconds; we refresh 60s before expiry. Cache key includes env so
    flipping sandbox↔production triggers a fresh token."""
    now = time.time()
    cache_key = f"token_{_env()}"
    cache_exp_key = f"expires_{_env()}"
    if _token_cache.get(cache_key) and _token_cache.get(cache_exp_key, 0) - 60 > now:
        return _token_cache[cache_key]

    cid, secret = _creds()
    auth = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    r = requests.post(
        _oauth_url(),
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {auth}",
        },
        data={"grant_type": "client_credentials", "scope": SCOPE},
        timeout=20,
    )
    r.raise_for_status()
    body = r.json()
    _token_cache[cache_key] = body["access_token"]
    _token_cache[cache_exp_key] = now + int(body.get("expires_in", 7200))
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
        f"{_base_url()}/item_summary/search",
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
        f"{_base_url()}/item/{item_id}",
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
