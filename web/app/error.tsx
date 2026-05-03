"use client";

// App-wide error boundary. Renders when a Server or Client Component throws
// during render or a server action fails. Logs through the structured logger
// so the message survives the navigation that wipes console state.
//
// Note: this only catches errors thrown DURING render. Errors thrown in
// effects / event handlers must be caught at the call site.

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Mirror to console — server-side this gets picked up by logging.
    // Client-side this gives the user (in dev) something to inspect.
    console.error("[cardex] uncaught error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="px-6 lg:px-10 py-16 max-w-xl mx-auto">
      <span className="eyebrow text-down">Something went wrong</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
        We hit an error rendering this page.
      </h1>
      <p className="mt-2 text-sm text-muted">
        Try refreshing — if it keeps happening, drop us a note at
        <a
          href="mailto:hello@cardex.app"
          className="ml-1 text-accent hover:text-fg transition-colors"
        >
          hello@cardex.app
        </a>{" "}
        and include this reference: <code className="font-mono">{error.digest ?? "—"}</code>
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm text-muted hover:text-fg transition-colors"
        >
          Back to market
        </Link>
      </div>
    </div>
  );
}
