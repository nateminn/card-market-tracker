// /auth/callback — handles the OAuth/email-confirmation redirect from Supabase.
// Supabase sends users here with a `code` query param; we exchange it for a
// session, fire the welcome email (idempotent — won't double-send if the
// user re-confirms), then bounce them home.

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { sendWelcomeIfNeeded } from "@/lib/welcome";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    await sb.auth.exchangeCodeForSession(code);
    const { data } = await sb.auth.getUser();
    if (data.user?.id && data.user.email) {
      // Best-effort. Failure is logged inside sendWelcomeIfNeeded; never
      // block the redirect.
      await sendWelcomeIfNeeded(data.user.id, data.user.email);
    }
  }
  const next = url.searchParams.get("next") ?? "/";
  return NextResponse.redirect(new URL(next, url.origin));
}
