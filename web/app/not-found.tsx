import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-6 lg:px-10 py-16 max-w-xl mx-auto">
      <span className="eyebrow text-muted">404</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
        We couldn&apos;t find that page.
      </h1>
      <p className="mt-2 text-sm text-muted">
        The card or player you&rsquo;re looking for might have been renamed or
        removed. Try searching from the header, or jump back to the market.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
        >
          Back to market
        </Link>
        <Link
          href="/players"
          className="text-sm text-muted hover:text-fg transition-colors"
        >
          Browse players
        </Link>
      </div>
    </div>
  );
}
