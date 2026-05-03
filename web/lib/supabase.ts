// Server-only Supabase client.
//
// Pulls SUPABASE_URL + SUPABASE_SECRET_KEY from env. The secret key bypasses
// Row-Level Security — never import this file from a "use client" component.
// (If we later need a client-side reader, we'll add a separate publishable-key
// client.)
//
// In dev: env comes from web/.env.local
// In prod: env comes from Netlify "Site settings → Environment variables"

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY env vars. " +
        "Set them in web/.env.local locally and in Netlify in production."
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  return cached;
}
