# Cardex — Product Document

> A market intelligence terminal for trading cards. Catalog, sales, scarcity, and analytics in one place. The Bloomberg part is the rigor; the look is anything but.

## Register

**product** — design serves the task. Users come in to scan prices, find undervalued cards, log trades, and leave. The interface should disappear into the work.

## Users

**Primary persona — The serious flipper.** Has a watchlist of 20–80 cards, refreshes prices several times a week, runs a small portfolio of open positions (often $500–$10k each). Comes from spreadsheets and PriceCharting. Wants signal, not noise. Knows what VWAP, gem rate, and pop reports are; resents being explained at.

**Adjacent — The investor.** Holds higher-value cards (>$5k), refreshes weekly. Cares more about scarcity scores and longer-term momentum than daily ticks.

**Not the user (yet) — Casual collectors.** Cardex is not a marketplace; we're not selling cards. People who want to browse pretty card images go to eBay or COMC.

## Brand

**Confidently unfashionable.** Trading-card analytics tools today are either ugly utility (PriceCharting, 130point) or generic SaaS dashboards (Card Ladder). Cardex is neither. The look is the look of a tool an analyst built for themselves and never bothered to consumerize, then noticed it had quiet taste.

**Tone of voice.**
- Precise. "Sales 30d: 98" beats "98 sales were tracked over the last 30 days".
- Numerate. Don't round when accuracy matters.
- No marketing puffery. No "powerful", "seamless", "unleash". No superlatives.
- Plainspoken in long form. Don't write as if every page were a help doc.

**Anti-references.** Things Cardex must NOT look like:
- The Bloomberg-terminal template — solid black background, electric green tickers, dense numbers tiled identically. This is the obvious move for a finance/data tool and therefore the wrong one.
- A consumer SaaS dashboard — full-width hero stats with gradient accents, kanban cards, soft pastel.
- Card-collector forums (Blowout, Beckett) — busy, ad-laden, 2008-vibrant.
- Crypto / NFT trading tools — neon on glass, glitch effects, "degen" copy.

## Strategic principles

1. **Density is an affordance.** Information density is a feature for this user. Don't dilute pages with whitespace to feel "modern". Tables are good. Numbers next to numbers are good.
2. **The tool serves the task.** The fastest pixel-to-decision path is the goal. Animation, ornament, and brand expression must clear that bar.
3. **Quiet brand, loud data.** Type and rhythm carry the product. The accent color appears for primary actions, current selection, and status indicators only — never as decoration.
4. **Truth over reassurance.** When data is missing or confidence is low, say so. Empty states teach the next step rather than apologizing.
5. **Earned familiarity.** Affordances follow Linear / Stripe / Notion conventions; we don't reinvent table sorts, modals, or focus rings for flavor.

## Core flows (MVP)

The MVP demonstrates these without authentication or write paths beyond the watchlist + portfolio:

1. Land on the dashboard, scan watchlist movement at a glance, click into the most interesting card.
2. On the card detail, read price history, key metrics, and recent sales; decide whether to act.
3. Open the gem scanner, filter to a sport / price range / confidence band, find an undervalued candidate.
4. Add to watchlist. Optionally log a paper trade.
5. Open the portfolio, review open positions and P&L.

## Out of scope (for now)

- Authentication / multi-user.
- Real-time push.
- Marketplace integration (buy/sell from inside Cardex).
- Card images. (We don't have a source yet; design must work without them.)
- Mobile-first ergonomics. (Desktop-first; mobile must function but not be flagship.)
