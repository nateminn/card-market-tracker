// Robots config - generated dynamically so the sitemap URL tracks the
// deployed origin. Pro pages and account pages are kept out of the index
// (no value to crawlers; some leak personal state).

import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cardex.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/portfolio",
          "/watchlist",
          "/upgrade",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
