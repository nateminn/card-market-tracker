#!/usr/bin/env bash
# weekly_refresh.sh — the canonical "refresh everything" sequence.
#
# Run this once a week (manually, or via launchd/cron) to keep the database
# warm: pull new pricing for priority cards → recompute analytics → refresh
# canonical card images.
#
# Order matters. Each step builds on the previous.
#
#   1. refresh_priority_pricing.py     — new sales rows for watchlist + stars
#   2. analytics_engine.py              — recompute VWAP/momentum from sales
#   3. populate_card_images.py          — pick best image per card
#   4. data_health.py                   — print final state for the log
#
# CardSight budget protection: --max-calls 100 keeps any single run well
# under the 750/month free-tier cap (run weekly = 400/month, 53% of budget).
#
# Logs go to logs/weekly-YYYY-MM-DD.log so you can audit later. Only the
# tail of stderr is also dumped to stderr so cron emails are useful.

set -euo pipefail

# ── Resolve paths ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

# ── Activate venv ──────────────────────────────────────────────────────
if [[ ! -d ".venv" ]]; then
    echo "ERROR: .venv not found at ${ROOT}/.venv" >&2
    exit 2
fi
# shellcheck source=/dev/null
source .venv/bin/activate

# ── Logging ────────────────────────────────────────────────────────────
mkdir -p logs
TODAY="$(date '+%Y-%m-%d')"
LOG="logs/weekly-${TODAY}.log"
exec > >(tee -a "${LOG}") 2>&1
echo "============================================================"
echo "Weekly refresh — $(date)"
echo "============================================================"

# ── 1) Pricing refresh ─────────────────────────────────────────────────
echo
echo "[1/4] refresh_priority_pricing.py (max 100 calls)"
python src/refresh_priority_pricing.py --yes --max-calls 100 || {
    echo "  ✗ priority pricing failed; continuing"
}

# ── 2) Analytics ───────────────────────────────────────────────────────
echo
echo "[2/4] analytics_engine.py"
python src/analytics_engine.py --top 5 || {
    echo "  ✗ analytics failed; continuing"
}

# ── 3) Card images ─────────────────────────────────────────────────────
echo
echo "[3/4] populate_card_images.py"
python src/populate_card_images.py || {
    echo "  ✗ image populate failed; continuing"
}

# ── 4) Health snapshot ─────────────────────────────────────────────────
echo
echo "[4/4] data_health.py"
python src/data_health.py

echo
echo "Done. Log: ${LOG}"
