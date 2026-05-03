"use client";

// Account menu in the header. Shows "Sign in" when logged out, user email +
// sign-out when logged in. Closes on outside click; Esc closes too.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Tier } from "@/lib/tier";

type Props = {
  initialEmail: string | null;
  initialTier?: Tier;
};

export default function AccountMenu({ initialEmail, initialTier = "anon" }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const tier = initialTier;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Subscribe to auth changes so the header updates without a hard reload.
  useEffect(() => {
    const sb = supabaseBrowser();
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!email) {
    return (
      <Link
        href="/auth/login"
        className="text-sm font-medium text-fg hover:text-accent transition-colors"
      >
        Sign in
      </Link>
    );
  }

  async function signOut() {
    const sb = supabaseBrowser();
    await sb.auth.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  const initials = (email.split("@")[0] || "?").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="size-8 rounded-full bg-panel-2 border border-border-2 text-[11px] font-mono uppercase tracking-wider text-fg hover:border-accent transition-colors duration-150 inline-flex items-center justify-center"
        title={email}
      >
        {initials}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 min-w-[220px] z-40 bg-panel-2 border border-border-2 rounded-sm shadow-xl py-1"
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-muted-2 truncate">
              {email}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={
                  tier === "pro"
                    ? "inline-block w-1.5 h-1.5 rounded-full bg-up"
                    : "inline-block w-1.5 h-1.5 rounded-full bg-muted-2"
                }
              />
              <span className="text-[11px] font-mono uppercase tracking-wider text-fg-2">
                {tier === "pro" ? "Pro" : "Free"}
              </span>
            </div>
          </div>
          {tier !== "pro" ? (
            <Link
              href="/upgrade"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-accent hover:bg-panel hover:text-fg transition-colors duration-150"
              role="menuitem"
            >
              Upgrade to Pro →
            </Link>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="w-full text-left px-3 py-2 text-sm text-fg-2 hover:bg-panel hover:text-fg transition-colors duration-150"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
