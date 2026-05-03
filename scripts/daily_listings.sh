#!/usr/bin/env bash
# daily_listings.sh — refresh active eBay listings for top-N cards.
#
# Active listings go stale within hours (auctions end, fixed-price listings
# get sold or relisted). This script runs every morning to keep the
# `active_listings` table representative of what's actually buyable today.
#
# Cost: 50 CardSight calls/day → 1500/month. Comfortably within the paid
# tier. On the free tier (750/month) this is too expensive — drop to
# weekly or pause until you upgrade. Easy to adjust via --max-cards.
#
# Logs to logs/listings-YYYY-MM-DD.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

if [[ ! -d ".venv" ]]; then
    echo "ERROR: .venv not found at ${ROOT}/.venv" >&2
    exit 2
fi
# shellcheck source=/dev/null
source .venv/bin/activate

mkdir -p logs
TODAY="$(date '+%Y-%m-%d')"
LOG="logs/listings-${TODAY}.log"
exec > >(tee -a "${LOG}") 2>&1
echo "============================================================"
echo "Daily listings refresh — $(date)"
echo "============================================================"

# Pick top 50 cards by 30d sales activity (defined inside the script).
python src/refresh_active_listings.py --max-cards 50 --yes

echo
echo "Done. Log: ${LOG}"
