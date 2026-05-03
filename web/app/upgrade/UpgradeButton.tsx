"use client";

// Stripe is not yet wired. Until the checkout endpoint exists, this button
// shows a "Coming soon" notice. Replace with a fetch to `/api/stripe/checkout`
// once the route is built.

import Link from "next/link";
import { useState } from "react";
import type { Tier } from "@/lib/tier";

export default function UpgradeButton({ tier }: { tier: Tier }) {
  const [clicked, setClicked] = useState(false);

  if (tier === "anon") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/auth/signup?next=/upgrade"
          className="inline-flex items-center justify-center px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
        >
          Create an account
        </Link>
        <Link
          href="/auth/login?next=/upgrade"
          className="text-sm text-muted hover:text-fg transition-colors"
        >
          Already have one? Sign in
        </Link>
      </div>
    );
  }

  if (tier === "pro") {
    return (
      <div className="text-sm text-up font-mono uppercase tracking-wider">
        ✓ You&apos;re on Pro. Thanks for the support.
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setClicked(true)}
        className="inline-flex items-center justify-center px-4 h-10 bg-accent text-bg font-medium text-sm hover:bg-fg transition-colors"
      >
        Upgrade to Pro
      </button>
      {clicked ? (
        <p className="mt-3 text-sm text-muted">
          Stripe checkout opens here once billing is enabled. Drop us a note at
          <a
            href="mailto:hello@cardex.app"
            className="ml-1 text-accent hover:text-fg transition-colors"
          >
            hello@cardex.app
          </a>{" "}
          and we&apos;ll comp you a month when it launches.
        </p>
      ) : null}
    </div>
  );
}
