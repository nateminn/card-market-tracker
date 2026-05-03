# Cardex automation

## Manual: run the weekly pipeline once

```bash
./scripts/weekly_refresh.sh
```

This is the canonical "refresh everything" sequence. It:

1. Pulls fresh CardSight pricing for watchlist + star cards (max 100 calls)
2. Re-runs the analytics engine (VWAP, momentum, etc.)
3. Re-picks canonical card images
4. Prints a final data-health snapshot

Logs go to `logs/weekly-YYYY-MM-DD.log` for audit.

## Automate: schedule it

Three options, in order of "set it and forget it":

### Option A — launchd (recommended for macOS, runs on local machine)

```bash
# Install (one time)
cp scripts/com.cardex.weekly-refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.cardex.weekly-refresh.plist

# Verify it loaded
launchctl list | grep cardex

# Run it once on demand to confirm it works
launchctl start com.cardex.weekly-refresh

# To uninstall later
launchctl unload ~/Library/LaunchAgents/com.cardex.weekly-refresh.plist
rm ~/Library/LaunchAgents/com.cardex.weekly-refresh.plist
```

Default schedule: every Monday at 6am local time. To change, edit the
`StartCalendarInterval` dict in the plist before installing.

**Caveat:** launchd only fires when your Mac is awake. If the Mac is
asleep at 6am Monday, the job runs the next time the Mac wakes up.
Acceptable for a weekly cadence.

### Option B — cron

If you prefer cron over launchd:

```bash
crontab -e
# add this line:
0 6 * * 1 cd /Users/nathan/Desktop/cardex && ./scripts/weekly_refresh.sh
```

Same caveat as launchd: only runs when the machine is on.

### Option C — GitHub Actions (cloud, runs even when laptop is off)

Requires committing the repo to GitHub and storing your `.env` secrets
as GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_KEY`,
`CARDSIGHT_API_KEY`). More secure since the schedule runs even when your
laptop is asleep, but requires more setup. Skeleton workflow:

```yaml
# .github/workflows/weekly-refresh.yml
name: Cardex weekly refresh
on:
  schedule:
    - cron: "0 6 * * 1"   # Monday 06:00 UTC
  workflow_dispatch:       # also allow manual runs
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.14"
      - run: |
          python -m venv .venv
          source .venv/bin/activate
          pip install -r requirements.txt
      - env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
          CARDSIGHT_API_KEY: ${{ secrets.CARDSIGHT_API_KEY }}
        run: ./scripts/weekly_refresh.sh
```

I can build this out if/when you commit the repo to GitHub.

## Troubleshooting

If a scheduled run fails silently, look at:

```bash
# What launchd recorded
cat logs/launchd-stderr.log
cat logs/launchd-stdout.log

# What the script itself recorded
cat logs/weekly-YYYY-MM-DD.log

# What loader_runs has
python src/loader_status.py --failed
```

`loader_status.py --stuck` will surface any run that started but never
finished (e.g. machine slept mid-run).
