import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import SearchBox from "@/components/ui/SearchBox";
import MobileNav from "@/components/ui/MobileNav";
import AccountMenu from "@/components/ui/AccountMenu";
import { getAllCards, getPlayers } from "@/lib/data";
import { getCurrentUser } from "@/lib/supabase-server";
import { getTier } from "@/lib/tier";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jbmono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cardex.app";
const SITE_TITLE = "Cardex — trading card market intelligence";
const SITE_DESCRIPTION =
  "Live sales data, volume-weighted analytics, and the Signal Engine — a proprietary score that flags graded cards trading above their statistical baseline. Free tier covers the market; Pro unlocks the picks.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · Cardex",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Cardex",
  keywords: [
    "trading cards",
    "sports cards",
    "PSA",
    "card prices",
    "card market analytics",
    "VWAP",
    "Signal Engine",
    "Bloomberg for cards",
  ],
  authors: [{ name: "Cardex" }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Cardex",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

const NAV = [
  { href: "/", label: "Market" },
  { href: "/players", label: "Players" },
  { href: "/signal", label: "Signal" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/portfolio", label: "Portfolio" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Pre-resolve search index server-side so the header search has data without
  // a client-side fetch. With ~10K cards this payload is ~1 MB; not ideal at
  // scale but fine for now. Optimization: switch to a server-driven search
  // endpoint when catalog grows past 50K.
  const [allCards, players, user, tier] = await Promise.all([
    getAllCards(),
    getPlayers(),
    getCurrentUser(),
    getTier(),
  ]);
  return (
    <html lang="en" className={`${inter.variable} ${jbmono.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <header className="border-b border-border h-14 px-4 sm:px-6 grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-6 sticky top-0 bg-bg/95 backdrop-blur z-30">
          {/* Logo block — left */}
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 justify-self-start"
            aria-label="Cardex home"
          >
            <CardexMark />
            <span className="font-mono text-sm tracking-[0.18em] text-fg hidden sm:inline">
              CARDEX
            </span>
          </Link>

          {/* Search — centered in the header, fuzzy match over players + cards */}
          <div className="w-full max-w-xl justify-self-center min-w-0">
            <SearchBox
              players={players.map((p) => ({
                slug: p.slug,
                name: p.name,
                sport: p.sport,
                cardCount: p.cards.length,
              }))}
              cards={allCards.map((c) => ({
                id: c.id,
                player_name: c.player_name,
                release_year: c.release_year,
                release_name: c.release_name,
                set_name: c.set_name,
                card_number: c.card_number,
                is_rookie: c.is_rookie,
                image_url: c.image_url ?? undefined,
              }))}
            />
          </div>

          {/* Right rail — nav (lg+) or hamburger (below lg) */}
          <div className="justify-self-end">
            {/* Desktop nav (lg+) */}
            <nav className="hidden lg:flex items-center gap-6">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-fg-2 hover:text-fg transition-colors duration-150"
                >
                  {item.label}
                </Link>
              ))}
              <span aria-hidden className="w-px h-5 bg-border" />
              <AccountMenu
                initialEmail={user?.email ?? null}
                initialTier={tier}
              />
            </nav>

            {/* Mobile + tablet nav */}
            <div className="lg:hidden">
              <MobileNav items={NAV} />
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>

        <footer className="border-t border-border px-6 py-2.5 flex flex-wrap items-center justify-between gap-y-1 gap-x-4 text-[11px] font-mono uppercase tracking-[0.08em] text-muted-2">
          <span>Cardex · trading card intel</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/legal/terms"
              className="hover:text-fg transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="hover:text-fg transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/legal/disclaimer"
              className="hover:text-fg transition-colors"
            >
              Disclaimer
            </Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}

function CardexMark() {
  return (
    <span
      aria-hidden
      className="size-7 rounded-md bg-up flex items-center justify-center"
    >
      <span className="block size-2.5 bg-bg" />
    </span>
  );
}

