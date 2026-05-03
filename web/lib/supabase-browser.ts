// Client-side Supabase client. Uses the PUBLISHABLE key (subject to RLS).
// Only use this from "use client" components. Server-side reads continue
// to go through lib/supabase.ts which uses the secret key.

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add them to web/.env.local — these are the *publishable* values that ship to the browser.",
    );
  }
  cached = createBrowserClient(url, key);
  return cached;
}
