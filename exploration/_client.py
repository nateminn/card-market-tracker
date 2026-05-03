"""CardSight API helper: tracks call count, saves every response to disk."""
import json
import os
import time
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BASE = "https://api.cardsight.ai/v1"
KEY = os.environ["CARDSIGHT_API_KEY"]
HEADERS = {"X-API-Key": KEY, "Accept": "application/json"}
EXP_DIR = Path(__file__).parent
COUNTER = EXP_DIR / "_call_count.txt"


def _bump():
    n = 0
    if COUNTER.exists():
        n = int(COUNTER.read_text().strip() or 0)
    n += 1
    COUNTER.write_text(str(n))
    return n


def call(path, params=None, save_as=None, method="GET", body=None):
    """Make a CardSight call, save the response, return (status, json_or_text)."""
    url = f"{BASE}{path}"
    n = _bump()
    t0 = time.time()
    if method == "GET":
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
    else:
        r = requests.request(method, url, headers=HEADERS, params=params, json=body, timeout=30)
    dt = time.time() - t0
    try:
        data = r.json()
    except Exception:
        data = {"_raw_text": r.text}

    if save_as:
        out = EXP_DIR / save_as
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(
                {
                    "_request": {"method": method, "url": url, "params": params, "body": body},
                    "_status": r.status_code,
                    "_call_number": n,
                    "_elapsed_s": round(dt, 3),
                    "data": data,
                },
                f,
                indent=2,
            )
    print(f"[call #{n}] {r.status_code} {method} {path} ({dt:.2f}s) -> {save_as or '(unsaved)'}")
    return r.status_code, data


def call_count():
    if COUNTER.exists():
        return int(COUNTER.read_text().strip() or 0)
    return 0
