// Mock news fixture. Real implementation would pull from a news API (sports
// + trading-card sources). Each item has source, date, headline, snippet.

export type NewsItem = {
  id: string;
  source: string;
  date: string; // ISO
  headline: string;
  snippet: string;
  /** Optional related card id so the UI can deep-link to a card detail. */
  cardId?: string;
};

export const NEWS: NewsItem[] = [
  {
    id: "n1",
    source: "Beckett",
    date: "2026-04-25T08:30:00Z",
    headline:
      "Paul Skenes' second-year run lifts Bowman Chrome Base PSA 10 above $150",
    snippet:
      "After a stretch of seven 10+ strikeout starts, the rookie sensation's flagship card is up nearly 18% on the week.",
    cardId: "skn-bc-bs",
  },
  {
    id: "n2",
    source: "Cardboard Connection",
    date: "2026-04-24T13:00:00Z",
    headline:
      "Wembanyama Prizm Silvers cooling: pop growth outpaces sales velocity",
    snippet:
      "PSA pop reports show steady gem-rate, but daily transaction count has halved month-over-month.",
    cardId: "wem-pp-bs",
  },
  {
    id: "n3",
    source: "MLB Trade Rumors",
    date: "2026-04-24T17:00:00Z",
    headline:
      "Ohtani extends home-run streak to seven games; cards continue moving",
    snippet:
      "2018 Topps Update PSA 10 last sold at $1,299 yesterday, the third sale above $1k this week.",
    cardId: "oht-tu-rc",
  },
  {
    id: "n4",
    source: "PWCC Marketplace",
    date: "2026-04-23T22:00:00Z",
    headline: "2024 NFL flagship cards trading higher into the schedule release",
    snippet:
      "Topps Chrome Football base rookies (Daniels, Bowers, Harrison Jr) saw double-digit weekly gains in PSA 10.",
  },
  {
    id: "n5",
    source: "Beckett",
    date: "2026-04-23T11:00:00Z",
    headline: "Beckett Grading rolls out faster turnaround for current-year rookies",
    snippet:
      "BGS announced a 10-business-day service tier for cards in the most active sports markets, effective May 1.",
  },
  {
    id: "n6",
    source: "Card Ladder",
    date: "2026-04-22T15:30:00Z",
    headline: "Vintage anchors hold up: Trout 2011 Update PSA 10 above $1.8k all month",
    snippet:
      "Pop crossed 11k earlier this quarter; despite headwinds elsewhere, Topps Update Trout has stayed firm.",
    cardId: "trt-tu-rc",
  },
];
