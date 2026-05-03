"""Signal backtest — does the Signal Engine actually pick winners?

Methodology (simple, honest):
  1. Pick a "score date" 30 days in the past.
  2. For every card with enough sales history, compute what Signal would
     have scored on that date using only sales <= score_date.
  3. Take the top-N picks (sorted by Signal score).
  4. Look at each pick's PSA 10 30d-VWAP today vs. on score_date.
  5. Compare top-N average return to (a) the median card's return, and
     (b) the average across the entire universe.
  6. Repeat over multiple score dates to see if the edge is consistent.

Output: a one-screen verdict — "Signal picks beat median by X%" or
"Signal picks under-perform by X%". This is the make-or-break test for
the paid feature.

Limitations:
  - We have ~5 months of CardSight history. Tests can only look back ~3 months.
  - Sample sizes are small for many cards. We require sales_count_30d >= 5
    on the score date to qualify.
  - "Today's PSA 10 VWAP" is approximated from latest sales — not as clean
    as a daily snapshot. analytics_daily would help; we don't have history yet.

Usage:
    python src/signal_backtest.py
    python src/signal_backtest.py --score-days-ago 60 --hold-days 30
    python src/signal_backtest.py --top 20
    python src/signal_backtest.py --json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import statistics as stats
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


# ---------------------------------------------------------------------------
# Sale fetching
# ---------------------------------------------------------------------------


def fetch_all_sales() -> list[dict]:
    """Pull every sale into memory. Filter to PSA + BGS only since that's
    what Signal scores against."""
    rows: list[dict] = []
    offset = 0
    while True:
        r = (
            sb.table("sales")
            .select("card_id, sold_at, price_usd, is_graded, grader, grade_value")
            .range(offset, offset + 999)
            .execute()
        )
        if not r.data:
            break
        rows.extend(r.data)
        if len(r.data) < 1000:
            break
        offset += 1000
    return rows


# ---------------------------------------------------------------------------
# Per-card metrics, computed from a slice of sales
# ---------------------------------------------------------------------------


def metrics_at_date(sales: list[dict], asof_ts: float) -> dict:
    """Compute a card's analytics using only sales sold_at <= asof_ts.

    Returns dict with: psa10_vwap_30d, vwap_7d, vwap_30d, sales_count_30d,
    momentum (7d vs 30d), or all-None if insufficient data.
    """
    DAY = 86400
    s30 = []
    s7 = []
    psa10_30 = []
    for s in sales:
        try:
            t = datetime.fromisoformat(s["sold_at"].replace("Z", "+00:00")).timestamp()
        except Exception:
            continue
        if t > asof_ts:
            continue
        if t >= asof_ts - 30 * DAY:
            s30.append(s)
            if t >= asof_ts - 7 * DAY:
                s7.append(s)
            if (
                s.get("grader") == "PSA"
                and s.get("grade_value") == "10"
                and s.get("is_graded")
            ):
                psa10_30.append(s)

    def mean(arr):
        prices = [float(x["price_usd"]) for x in arr if x.get("price_usd") is not None]
        if not prices:
            return None
        return sum(prices) / len(prices)

    v30 = mean(s30)
    v7 = mean(s7)
    psa10v = mean(psa10_30)
    momentum = None
    if v7 is not None and v30 is not None and v30 > 0:
        momentum = (v7 - v30) / v30
    return {
        "vwap_7d": v7,
        "vwap_30d": v30,
        "psa10_vwap_30d": psa10v,
        "sales_count_30d": len(s30),
        "momentum": momentum,
    }


def signal_score(metrics: dict) -> float:
    """The same naive Signal formula web/lib/data.ts uses for getGemPicks:
    |momentum| × 100 + log10(sales_count) × 20, capped at 100.

    Returns 0 if metrics are insufficient.
    """
    mom = metrics.get("momentum")
    samples = metrics.get("sales_count_30d", 0)
    if mom is None or samples < 5:
        return 0.0
    score = abs(mom) * 100 + math.log10(max(1, samples)) * 20
    return min(100.0, score)


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------


def backtest(
    sales_by_card: dict[str, list[dict]],
    score_days_ago: int,
    hold_days: int,
    top_n: int,
    min_samples: int = 5,
) -> dict:
    """Run a single backtest pass.

    Returns:
      {
        score_date: ISO string,
        eval_date: ISO string,
        eligible: int (cards we could score),
        picks: int (cards in top_n),
        median_return: float,
        mean_return: float,
        top_return_mean: float,
        top_return_median: float,
        edge_vs_median: float,
        edge_vs_mean: float,
      }
    """
    DAY = 86400
    now_ts = datetime.now(timezone.utc).timestamp()
    score_ts = now_ts - score_days_ago * DAY
    eval_ts = score_ts + hold_days * DAY

    # 1) Score every card AS OF score_ts.
    scored: list[tuple[str, float, float, float]] = []
    # (card_id, score, psa10_at_score_date, psa10_at_eval_date)
    for card_id, card_sales in sales_by_card.items():
        m_score = metrics_at_date(card_sales, score_ts)
        m_eval = metrics_at_date(card_sales, eval_ts)
        if m_score["sales_count_30d"] < min_samples:
            continue
        if m_score["psa10_vwap_30d"] is None or m_eval["psa10_vwap_30d"] is None:
            continue
        score = signal_score(m_score)
        scored.append(
            (card_id, score, m_score["psa10_vwap_30d"], m_eval["psa10_vwap_30d"])
        )

    if not scored:
        return {
            "score_date": datetime.fromtimestamp(score_ts, tz=timezone.utc).isoformat(),
            "eval_date": datetime.fromtimestamp(eval_ts, tz=timezone.utc).isoformat(),
            "eligible": 0,
            "picks": 0,
            "median_return": None,
            "mean_return": None,
            "top_return_mean": None,
            "top_return_median": None,
            "edge_vs_median": None,
            "edge_vs_mean": None,
        }

    # 2) Universe returns
    universe_returns = [
        (eval_p / score_p - 1) for (_, _, score_p, eval_p) in scored if score_p > 0
    ]
    median_ret = stats.median(universe_returns)
    mean_ret = stats.mean(universe_returns)

    # 3) Top-N picks by score
    scored.sort(key=lambda x: x[1], reverse=True)
    top = scored[:top_n]
    top_returns = [
        (eval_p / score_p - 1) for (_, _, score_p, eval_p) in top if score_p > 0
    ]
    top_mean = stats.mean(top_returns) if top_returns else 0.0
    top_median = stats.median(top_returns) if top_returns else 0.0

    return {
        "score_date": datetime.fromtimestamp(score_ts, tz=timezone.utc).isoformat()[:10],
        "eval_date": datetime.fromtimestamp(eval_ts, tz=timezone.utc).isoformat()[:10],
        "eligible": len(scored),
        "picks": len(top),
        "median_return": round(median_ret, 4),
        "mean_return": round(mean_ret, 4),
        "top_return_mean": round(top_mean, 4),
        "top_return_median": round(top_median, 4),
        "edge_vs_median": round(top_mean - median_ret, 4),
        "edge_vs_mean": round(top_mean - mean_ret, 4),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--score-days-ago", type=int, default=60,
                    help="how many days back to compute Signal scores")
    ap.add_argument("--hold-days", type=int, default=30,
                    help="how many days to look forward when measuring return")
    ap.add_argument("--top", type=int, default=20,
                    help="size of the 'Signal picks' bucket")
    ap.add_argument("--multi-window", action="store_true",
                    help="run several score-date windows and average")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    print("Pulling sales...")
    all_sales = fetch_all_sales()
    print(f"  {len(all_sales):,} sales rows")

    sales_by_card: dict[str, list[dict]] = defaultdict(list)
    for s in all_sales:
        sales_by_card[s["card_id"]].append(s)
    print(f"  {len(sales_by_card):,} unique cards with sales")

    runs: list[dict] = []
    if args.multi_window:
        for d in (90, 75, 60, 45):
            runs.append(backtest(sales_by_card, d, args.hold_days, args.top))
    else:
        runs.append(backtest(sales_by_card, args.score_days_ago, args.hold_days, args.top))

    if args.json:
        print(json.dumps(runs, indent=2))
        return 0

    print()
    print("=" * 78)
    print("SIGNAL BACKTEST")
    print("=" * 78)
    print(f"  Hold days: {args.hold_days}    Top-N picks: {args.top}\n")
    print(
        f"  {'SCORE DATE':<13s}  {'EVAL DATE':<13s}  {'ELIGIBLE':>9s}  "
        f"{'TOP MEAN':>10s}  {'UNIV MEDIAN':>13s}  {'EDGE':>9s}"
    )
    print("  " + "-" * 76)
    for r in runs:
        if r["eligible"] == 0:
            print(f"  {r['score_date']:<13s}  {r['eval_date']:<13s}  insufficient data")
            continue
        edge = r["edge_vs_median"]
        edge_pct = f"{edge*100:+.1f}%" if edge is not None else "—"
        top_mean = f"{r['top_return_mean']*100:+.1f}%" if r["top_return_mean"] is not None else "—"
        univ_med = f"{r['median_return']*100:+.1f}%" if r["median_return"] is not None else "—"
        glyph = "✓" if edge and edge > 0 else "✗" if edge and edge < 0 else "—"
        print(
            f"  {r['score_date']:<13s}  {r['eval_date']:<13s}  "
            f"{r['eligible']:>9d}  {top_mean:>10s}  {univ_med:>13s}  {edge_pct:>8s} {glyph}"
        )

    if len(runs) > 1:
        edges = [r["edge_vs_median"] for r in runs if r["edge_vs_median"] is not None]
        if edges:
            avg_edge = sum(edges) / len(edges)
            wins = sum(1 for e in edges if e > 0)
            print()
            print(
                f"  Across {len(edges)} windows: average edge = {avg_edge*100:+.1f}%  "
                f"({wins}/{len(edges)} windows positive)"
            )

    print()
    print("Verdict:")
    valid = [r for r in runs if r.get("edge_vs_median") is not None]
    if not valid:
        print("  Insufficient data to validate. Need more sales history accumulated.")
        return 0
    avg_edge = sum(r["edge_vs_median"] for r in valid) / len(valid)
    if avg_edge > 0.02:
        print(
            f"  Signal picks outperformed median by {avg_edge*100:+.1f}% on average. "
            f"Engine is picking winners."
        )
    elif avg_edge > 0:
        print(
            f"  Signal picks marginally outperformed (+{avg_edge*100:.1f}%). "
            f"Inconclusive — needs more samples."
        )
    else:
        print(
            f"  Signal picks UNDER-performed by {abs(avg_edge)*100:.1f}%. "
            f"Engine needs work before paywalling."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
