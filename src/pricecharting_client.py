"""PriceCharting Legendary API client (scaffold).

Status: NOT WIRED to a real subscription yet. Code path exists for when
the user subscribes to Legendary at $49/mo and gets API access.

Why we want this:
  - Years of historical pricing (CardSight is rolling 5mo only)
  - Suggested buy/sell prices to validate Signal against
  - Item Demand Reports
  - Bulk downloadable price lists

Subscription:
  https://www.pricecharting.com/account/subscription -> "Legendary" tier
  After subscribing, the API token appears at:
    https://www.pricecharting.com/account/api-key

Env required:
  PRICECHARTING_API_TOKEN  (32-char hex from the dashboard)

Endpoints we'll wire:
  GET /api/product?t=<token>&id=<id>
  GET /api/product?t=<token>&q=<keyword search>
  GET /api/products?t=<token>&offset=N      (paginated bulk)

Reference: https://www.pricecharting.com/api-documentation
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
COUNTER = ROOT / "exploration" / "_pricecharting_call_count.txt"

BASE_URL = "https://www.pricecharting.com/api"


def _bump_counter() -> int:
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    n += 1
    COUNTER.write_text(str(n))
    return n


def call_count() -> int:
    if COUNTER.exists():
        return int(COUNTER.read_text().strip() or 0)
    return 0


def _token() -> str:
    t = os.environ.get("PRICECHARTING_API_TOKEN")
    if not t:
        raise RuntimeError(
            "PRICECHARTING_API_TOKEN not set. Subscribe to Legendary at "
            "https://www.pricecharting.com/account/subscription, then copy "
            "the token from https://www.pricecharting.com/account/api-key "
            "into .env."
        )
    return t


def get_product(*, product_id: str | None = None, q: str | None = None) -> dict:
    """Fetch a single product by id OR keyword. Returns the full JSON body
    on success, or {"_error": "...", "_status": int} on HTTP failure."""
    if not (product_id or q):
        raise ValueError("get_product needs product_id or q")
    _bump_counter()
    params: dict = {"t": _token()}
    if product_id:
        params["id"] = product_id
    if q:
        params["q"] = q
    r = requests.get(f"{BASE_URL}/product", params=params, timeout=30)
    if r.status_code != 200:
        return {"_error": r.text[:500], "_status": r.status_code}
    return r.json()


def list_products(*, offset: int = 0, console_id: int | None = None) -> dict:
    """Bulk listing endpoint. Use to backfill historical-price tables.
    `console_id` filters by a PriceCharting category (sports cards have
    their own ids — discover via product detail responses)."""
    _bump_counter()
    params: dict = {"t": _token(), "offset": offset}
    if console_id is not None:
        params["console-id"] = console_id
    r = requests.get(f"{BASE_URL}/products", params=params, timeout=30)
    if r.status_code != 200:
        return {"_error": r.text[:500], "_status": r.status_code}
    return r.json()
