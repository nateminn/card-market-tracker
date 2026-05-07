"""PSA Public API client - cert lookups via curl subprocess.

Python's `requests` library is Cloudflare-blocked at api.psacard.com (its
TLS fingerprint trips bot detection). curl's fingerprint passes. So this
client shells out to /usr/bin/curl rather than using requests.

Free tier: 100 calls/day. The client tracks calls in
exploration/_psa_call_count.txt (separate from the CardSight counter so
they don't clobber each other).

Usage:
    from psa_client import lookup_cert
    data = lookup_cert("98138095")   # returns dict or None
"""

from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
COUNTER = ROOT / "exploration" / "_psa_call_count.txt"
DAILY_LIMIT = 100  # PSA free tier cap

BASE = "https://api.psacard.com/publicapi"


def _bump_counter() -> int:
    n = int(COUNTER.read_text().strip() or 0) if COUNTER.exists() else 0
    n += 1
    COUNTER.write_text(str(n))
    return n


def call_count() -> int:
    if COUNTER.exists():
        return int(COUNTER.read_text().strip() or 0)
    return 0


def reset_counter():
    """Reset the daily counter. Call this once per day (or have the caller
    track via date). For now: manual."""
    COUNTER.write_text("0")


def lookup_cert(cert_number: str, *, timeout: int = 15) -> dict | None:
    """Hit /cert/GetByCertNumber/<n>. Returns the parsed PSACert dict on
    success, None on any failure. Bumps the daily counter on each call.

    Failure modes returning None:
      - HTTP non-200
      - JSON parse error
      - "IsValidRequest": false
      - "ServerMessage": "No data found"
    """
    token = os.environ.get("PSA_API_TOKEN")
    if not token:
        raise RuntimeError("PSA_API_TOKEN not set in env")
    n = _bump_counter()

    url = f"{BASE}/cert/GetByCertNumber/{cert_number}"
    cmd = [
        "/usr/bin/curl",
        "-s",
        "-w", "\n%{http_code}",
        "-H", f"Authorization: bearer {token}",
        url,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"  [psa #{n}] TIMEOUT for cert {cert_number}")
        return None
    if proc.returncode != 0:
        print(f"  [psa #{n}] curl error {proc.returncode}: {proc.stderr[:120]}")
        return None

    out = proc.stdout
    # Last line is the HTTP status, body is everything before
    nl = out.rfind("\n")
    body = out[:nl] if nl != -1 else out
    status = (out[nl + 1 :] if nl != -1 else "").strip()
    if status != "200":
        print(f"  [psa #{n}] HTTP {status} for cert {cert_number}")
        return None
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        print(f"  [psa #{n}] non-JSON response for cert {cert_number}")
        return None

    # Two negative-success shapes
    inner = data.get("PSACert") if isinstance(data, dict) else None
    if not inner:
        msg = data.get("ServerMessage") if isinstance(data, dict) else None
        print(f"  [psa #{n}] no data for cert {cert_number} ({msg})")
        return None

    return inner


if __name__ == "__main__":
    # Smoke test
    import sys
    cert = sys.argv[1] if len(sys.argv) > 1 else "98138095"
    data = lookup_cert(cert)
    if data:
        print(json.dumps(data, indent=2))
    print(f"\nCalls used today: {call_count()}/{DAILY_LIMIT}")
