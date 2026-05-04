// Sitemap - enumerates the public, indexable URLs.
// We include:
//   - Static marketing/legal/Signal pages
//   - Every player page (one per slug)
//   - Every card page (cap to keep payload <50K URLs per sitemap)
//
// Card pages are dynamically rendered, so we set a weekly changefreq.
// Player pages aggregate, so daily.

import type { MetadataRoute } from "next";
import { getAllCards, getPlayers } from "@/lib/data";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cardex.app";

// Hard cap; sitemaps can hold 50K URLs each. With ~10K cards we're far under.
const CARD_LIMIT = 45000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [players, cards] = await Promise.all([getPlayers(), getAllCards()]);

  const now = new Date();

  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0, lastModified: now },
    { url: `${SITE_URL}/players`, changeFrequency: "daily", priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/signal`, changeFrequency: "hourly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/disclaimer`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const playerUrls: MetadataRoute.Sitemap = players.map((p) => ({
    url: `${SITE_URL}/players/${p.slug}`,
    changeFrequency: "daily" as const,
    priority: 0.7,
    lastModified: now,
  }));

  const cardUrls: MetadataRoute.Sitemap = cards.slice(0, CARD_LIMIT).map((c) => ({
    url: `${SITE_URL}/cards/${c.id}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
    lastModified: now,
  }));

  return [...staticUrls, ...playerUrls, ...cardUrls];
}
