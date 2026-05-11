"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
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
          className="cdx-input w-full h-10"
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="cdx-input w-full h-10"
        />
      </label>
      {error ? (
        <p className="text-sm text-down border border-down/40 bg-down/10 px-3 py-2 rounded-md">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-full h-10 px-4 bg-accent text-bg text-sm font-medium rounded-md hover:bg-accent/90 transition-colors duration-150 disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
