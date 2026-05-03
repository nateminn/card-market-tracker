// Welcome-email logic. Called from two places:
//   - /api/auth/welcome (POST) — fired by the client signup form after
//     signUp() succeeds with a session
//   - /auth/callback (GET) — fired after Supabase exchanges a confirmation
//     code for a session
//
// Both paths converge here. We dedupe via profiles.welcomed_at so a user
// never gets two welcomes regardless of which path their signup took.

import "server-only";

import { supabase as backendSupabase } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { logInfo, reportError } from "@/lib/log";

const WELCOME_HTML = `
<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0b0d10;max-width:560px;margin:0 auto;padding:32px 24px;line-height:1.55">
  <h1 style="font-size:22px;margin:0 0 12px 0;letter-spacing:-0.5px">Welcome to Cardex.</h1>
  <p style="margin:0 0 16px 0">You&rsquo;re in. Cardex is a working terminal for the trading-card market — live sales, volume-weighted analytics, and the Signal Engine.</p>
  <p style="margin:0 0 8px 0;font-weight:600">A few places to start:</p>
  <ul style="margin:0 0 16px 0;padding-left:20px">
    <li><a href="https://cardex.app/" style="color:#22c55e;text-decoration:none">Market dashboard</a> — what&rsquo;s moving today</li>
    <li><a href="https://cardex.app/signal" style="color:#22c55e;text-decoration:none">Signal Engine</a> — top picks (free preview, Pro unlocks the full list)</li>
    <li><a href="https://cardex.app/players" style="color:#22c55e;text-decoration:none">Players</a> — drill into a player&rsquo;s catalog</li>
  </ul>
  <p style="margin:24px 0 0 0;color:#6b7280;font-size:13px">Reply to this email if anything breaks or feels off. Real human reads every reply.</p>
  <p style="margin:8px 0 0 0;color:#6b7280;font-size:13px">— Cardex</p>
</div>`;

const WELCOME_TEXT = `Welcome to Cardex.

You're in. Cardex is a working terminal for the trading-card market — live sales, volume-weighted analytics, and the Signal Engine.

A few places to start:
  - Market dashboard: https://cardex.app/
  - Signal Engine:    https://cardex.app/signal
  - Players:          https://cardex.app/players

Reply to this email if anything breaks. Real human reads every reply.

— Cardex`;

export async function sendWelcomeIfNeeded(userId: string, email: string) {
  const sb = backendSupabase();

  const { data, error } = await sb
    .from("profiles")
    .select("welcomed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    reportError(error, { route: "lib/welcome.lookup", userId });
    return { sent: false, reason: "lookup_failed" as const };
  }
  if (data?.welcomed_at) {
    return { sent: false, reason: "already_welcomed" as const };
  }

  try {
    await sendEmail({
      to: email,
      subject: "Welcome to Cardex",
      html: WELCOME_HTML,
      text: WELCOME_TEXT,
      tag: "welcome",
    });
  } catch (err) {
    reportError(err, { route: "lib/welcome.send", userId, email });
    return { sent: false, reason: "send_failed" as const };
  }

  const { error: updErr } = await sb
    .from("profiles")
    .update({ welcomed_at: new Date().toISOString() })
    .eq("id", userId);
  if (updErr) {
    // Email already went out; the only consequence is potentially a duplicate
    // on a future signup event. Worth a log but not worth failing.
    reportError(updErr, { route: "lib/welcome.markSent", userId });
  }

  logInfo("welcome.sent", { userId, email });
  return { sent: true, reason: null };
}
