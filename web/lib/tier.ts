// Tier resolution. Single source of truth for "is the current user Pro?"
//
// We use the trusted backend client (lib/supabase.ts, secret key) rather than
// the cookie-aware client because tier reads happen on every request to gated
// pages and bypassing RLS keeps the query fast. Auth identity still comes
// from the cookie-aware client (getCurrentUser).
//
// Defaults: signed-out users are 'anon'. Signed-in users without a profile
// row default to 'free' (the trigger should always create one - but if the
// migration hasn't been applied yet, treat them as free rather than crash).
//
// USAGE
//   const tier = await getTier();
//   if (tier !== "pro") return <UpgradeWall />;
//
// The Stripe webhook (when wired) will UPDATE profiles.tier='pro' when a
// subscription is created and 'free' when it's cancelled.

import { supabase as backendSupabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";

export type Tier = "anon" | "free" | "pro";

export async function getTier(): Promise<Tier> {
  const user = await getCurrentUser();
  if (!user) return "anon";

  const sb = backendSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("tier")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return "free";
  return data.tier === "pro" ? "pro" : "free";
}

export function isPro(tier: Tier): boolean {
  return tier === "pro";
}
