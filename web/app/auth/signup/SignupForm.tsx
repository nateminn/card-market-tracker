"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user && !data.session) {
      // Email confirmation required (Supabase default). Welcome email
      // fires from /auth/callback after they click the link.
      setInfo("Check your inbox for a confirmation link.");
      return;
    }
    // Email confirmation off → session created immediately. Fire the
    // welcome email server-side. We don't await blocking — the redirect
    // can happen in parallel.
    fetch("/api/auth/welcome", { method: "POST" }).catch(() => {
      // Welcome email is best-effort; never block signup on it.
    });
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="block text-[11px] font-mono uppercase tracking-[0.06em] text-muted mb-1.5">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full h-10 px-3 bg-panel-2 border border-border rounded-md text-sm text-fg placeholder:text-muted focus:outline-none focus:border-border-2"
          placeholder="you@example.com"
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-mono uppercase tracking-[0.06em] text-muted mb-1.5">
          Password
        </span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full h-10 px-3 bg-panel-2 border border-border rounded-md text-sm text-fg placeholder:text-muted focus:outline-none focus:border-border-2"
        />
      </label>
      {error ? (
        <p className="text-sm text-down border border-down/40 bg-down/10 px-3 py-2 rounded-md">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-up border border-up/40 bg-up/10 px-3 py-2 rounded-md">
          {info}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full h-10 px-4 bg-accent text-bg text-sm font-medium rounded-md hover:bg-accent/90 transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
