#!/usr/bin/env bash
# Daily eBay Browse listings refresh.
# Hits the eBay Browse API directly for the top N cards by activity.
# Free 5K calls/day so 200 cards/day is well within budget.
#
# Logs to logs/ebay-listings-YYYY-MM-DD.log.

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
LOG="logs/ebay-listings-${TODAY}.log"
exec > >(tee -a "${LOG}") 2>&1

echo "============================================================"
echo "Daily eBay Browse listings refresh — $(date)"
echo "============================================================"

python src/refresh_active_listings_ebay.py --top 200 --yes

echo
echo "Done. Log: ${LOG}"
