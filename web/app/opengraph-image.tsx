// Auto-generated OG image for the site root. Next.js renders this at build
// time and serves it as /opengraph-image. Sub-routes can ship their own
// opengraph-image.tsx for richer cards (e.g. card detail pages with the
// player name and price).

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Cardex — trading card market intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0b0d10",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 16, height: 16, background: "#0b0d10" }} />
          </div>
          <span
            style={{
              fontSize: 22,
              letterSpacing: 6,
              color: "#e5e7eb",
              fontWeight: 600,
            }}
          >
            CARDEX
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span
            style={{
              fontSize: 18,
              letterSpacing: 4,
              color: "#22c55e",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            The trading desk for sports cards
          </span>
          <span
            style={{
              fontSize: 64,
              color: "#f3f4f6",
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            Live sales. Active listings. Algorithmic picks.
          </span>
          <span
            style={{
              fontSize: 24,
              color: "#9ca3af",
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Signal Engine: +34% backtested edge over the median. Free to browse.
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, color: "#6b7280", letterSpacing: 2 }}>
            19K+ CARDS · 140K+ SALES · 6H REFRESH
          </span>
          <span style={{ fontSize: 16, color: "#6b7280" }}>cardex.app</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
