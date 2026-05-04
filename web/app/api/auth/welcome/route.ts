// POST /api/auth/welcome
//
// Called by the signup form (and any other place that wants to fire a
// welcome email for the currently-signed-in user). Reads the user from
// the session cookie - never trusts client-supplied identity.
//
// Idempotent: sendWelcomeIfNeeded() dedupes via profiles.welcomed_at.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-server";
import { sendWelcomeIfNeeded } from "@/lib/welcome";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const result = await sendWelcomeIfNeeded(user.id, user.email);
  return NextResponse.json(result);
}
