# Cardex

Trading card market intelligence platform — Bloomberg Terminal for trading cards.

## Data sources

- **CardSight AI** (`cardsight.ai`) — primary catalog + pricing API (8M+ cards)
- **PSA** — population data (planned)
- **eBay** — supplemental active listings (planned)

## Project structure

```
cardex/
├── .env                    # CARDSIGHT_API_KEY (gitignored)
├── exploration/            # API test scripts and saved responses
├── data/                   # Saved JSON/CSV data (gitignored)
├── src/                    # Main application code
└── requirements.txt
```

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## API budget

- Free tier: 750 calls/month
- Track usage in exploration scripts before making calls
