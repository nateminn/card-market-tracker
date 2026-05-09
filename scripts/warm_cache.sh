#!/usr/bin/env bash
# Warm the production unstable_cache entries on a 5-min schedule.
#
# Why: with no traffic yet, every visitor is "first user per cache window"
# and eats the 8-14s cold-start cost. This script hits the highest-value
# pages every 5 minutes so real visitors always land on warm cache (~2s).
#
# Pages warmed:
#   /, /signal, /players, /watchlist        (static aggregators)
#   /players/<slug>                         (top 20 by 30d sales activity)
#
# Cost: ~24 GET requests per cycle, sub-2s each, no DB load past the first
# hit per TTL window. eBay/CardSight quotas not touched.
#
# Logs to logs/warm-cache-YYYY-MM-DD.log.

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
LOG="logs/warm-cache-${TODAY}.log"

# All output → log file (append, with timestamps)
{
echo "============================================================"
echo "Cache warm — $(date)"
echo "============================================================"

BASE_URL="${CARDEX_URL:-https://card-market-tracker.netlify.app}"
echo "Target: ${BASE_URL}"
echo

# Static aggregators (always warm these)
for path in "/" "/signal" "/players" "/watchlist"; do
    code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 30 "${BASE_URL}${path}")
    echo "  ${path} → ${code_time}s"
done

echo

# Top 20 players by 30d activity → warm /players/<slug>
SLUGS=$(python3 - <<PY
import os, re, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path("${ROOT}/.env"))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Pull top 200 cards by 30d activity, then unique players
ana = (sb.table("analytics_daily")
       .select("card_id, sales_count_30d")
       .gt("sales_count_30d", 0)
       .order("sales_count_30d", desc=True)
       .limit(200)
       .execute().data) or []
ids = [a["card_id"] for a in ana]
if not ids:
    sys.exit(0)
cards = (sb.table("card_identity")
         .select("id, player_name")
         .in_("id", ids)
         .execute().data) or []
seen = set()
slugs = []
order = {a["card_id"]: i for i, a in enumerate(ana)}
for c in sorted(cards, key=lambda c: order.get(c["id"], 999)):
    name = (c.get("player_name") or "").strip()
    if not name or name == "?" or "Variation" in name:
        continue
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not slug or slug in seen:
        continue
    seen.add(slug)
    slugs.append(slug)
    if len(slugs) >= 20:
        break
print(" ".join(slugs))
PY
)

if [[ -z "${SLUGS}" ]]; then
    echo "  (no active players to warm)"
else
    for slug in ${SLUGS}; do
        code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" --max-time 30 "${BASE_URL}/players/${slug}")
        echo "  /players/${slug} → ${code_time}s"
    done
fi

echo
echo "Done."
} >> "${LOG}" 2>&1
